Option Explicit

'=========================================================
' 01) 접수 & 결합 검수 매칭 + 상품/속도 정규화 비교 + 웹미존재_접수건 출력
'=========================================================
Public Sub 검수_01_접수결합매칭_최종()

    Dim wsWeb As Worksheet, wsAcc As Worksheet, wsComb As Worksheet, wsOut As Worksheet

    Set wsWeb = ThisWorkbook.Worksheets("웹")
    Set wsAcc = ThisWorkbook.Worksheets("접수")
    Set wsComb = ThisWorkbook.Worksheets("결합")

    '웹미존재_접수건 시트 준비
    Set wsOut = PrepareOutSheet("웹미존재_접수건")
    WriteOutHeader wsOut

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

    '==========================
    ' 컬럼 정의
    '==========================
    Const WEB_H As String = "H" '웹 서비스번호
    Const WEB_D As String = "D" '웹 상품
    Const WEB_AE As String = "AE" 'AD
    Const WEB_BL As String = "BL" 'BK
    Const WEB_BM As String = "BM" '결합여부
    Const WEB_BN As String = "BN" '접수검수
    Const WEB_BO As String = "BO" '최종판정

    Const ACC_X As String = "X" '접수 서비스번호
    Const ACC_W As String = "W" '인터넷계약번호
    Const ACC_AK As String = "AK" '상품
    Const ACC_B As String = "AE" '고객명
    Const ACC_U As String = "U" '상태

    Const COMB_R As String = "R" '결합 시트 주민번호

    '헤더 보장
    EnsureHeader wsWeb, 1, WEB_BM, "결합여부"
    EnsureHeader wsWeb, 1, WEB_BN, "접수검수"
    EnsureHeader wsWeb, 1, WEB_BO, "최종판정"

    '마지막 행
    Dim lastWeb As Long, lastAcc As Long, lastComb As Long
    lastWeb = LastRow(wsWeb, ColNum(wsWeb, WEB_H))
    lastAcc = LastRow(wsAcc, ColNum(wsAcc, ACC_X))
    lastComb = LastRow(wsComb, ColNum(wsComb, COMB_R))

    '==========================
    ' 결합 인덱스 구축 (6자리 주민번호)
    '==========================
    Dim dictComb6 As Object: Set dictComb6 = CreateObject("Scripting.Dictionary")
    dictComb6.CompareMode = 1

    Dim r As Long, comb6 As String
    For r = 3 To lastComb
        comb6 = Left6Digits(wsComb.Range(COMB_R & r).Value)
        If Len(comb6) = 6 Then dictComb6(comb6) = True
    Next r

    '==========================
    ' 웹 H 8자리 키 인덱스 구축
    '==========================
    Dim dictWebKeyExists As Object: Set dictWebKeyExists = CreateObject("Scripting.Dictionary")
    dictWebKeyExists.CompareMode = 1

    Dim webKeys As Collection, cand As Variant
    For r = 2 To lastWeb
        Set webKeys = ExtractKey8Candidates(wsWeb.Range(WEB_H & r).Value)
        For Each cand In webKeys
            dictWebKeyExists(CStr(cand)) = True
        Next cand

        '웹 결합여부
        Dim ad6 As String, bk6 As String
        ad6 = Left6Digits(wsWeb.Range(WEB_AE & r).Value)
        bk6 = Left6Digits(wsWeb.Range(WEB_BL & r).Value)

        If Len(ad6) = 6 And dictComb6.Exists(ad6) Then
            wsWeb.Range(WEB_BM & r).Value = "O"
        ElseIf Len(bk6) = 6 And dictComb6.Exists(bk6) Then
            wsWeb.Range(WEB_BM & r).Value = "O"
        Else
            wsWeb.Range(WEB_BM & r).Value = "결합 X"
        End If

        wsWeb.Range(WEB_BO & r).Value = "" '최종판정 초기화
    Next r

    '==========================
    ' 접수 인덱스 구축 + 웹 미존재 기록용
    '==========================
    Dim dictAccKeyExists As Object: Set dictAccKeyExists = CreateObject("Scripting.Dictionary")
    dictAccKeyExists.CompareMode = 1

    Dim dictAccProdExists As Object: Set dictAccProdExists = CreateObject("Scripting.Dictionary")
    dictAccProdExists.CompareMode = 1

    Dim dictAccRow As Object: Set dictAccRow = CreateObject("Scripting.Dictionary")
    dictAccRow.CompareMode = 1

    Dim writeRow As Long: writeRow = 2 'wsOut 첫 행은 헤더
    Dim accProdNorm As String, hasAnyWebKey As Boolean

    For r = 3 To lastAcc
        Dim accKeys As Collection
        Set accKeys = ExtractKey8Candidates(wsAcc.Range(ACC_X & r).Value)
        If accKeys.Count = 0 Then GoTo NextAcc

        accProdNorm = NormalizeAccCompare(wsAcc.Range(ACC_AK & r).Value)
        hasAnyWebKey = False

        Dim key8 As String
        For Each cand In accKeys
            key8 = CStr(cand)
            dictAccKeyExists(key8) = True
            dictAccRow(key8) = r
            dictAccProdExists(key8 & "|" & accProdNorm) = True

            If dictWebKeyExists.Exists(key8) Then hasAnyWebKey = True
        Next cand

        If Not hasAnyWebKey Then
            '웹 H에서 키 후보 없음 → wsOut 기록
            wsOut.Range("A" & writeRow).Value = wsAcc.Range(ACC_B & r).Value
            wsOut.Range("B" & writeRow).Value = wsAcc.Range(ACC_X & r).Value
            wsOut.Range("C" & writeRow).Value = wsAcc.Range(ACC_W & r).Value
            wsOut.Range("D" & writeRow).Value = wsAcc.Range(ACC_AK & r).Value
            wsOut.Range("E" & writeRow).Value = r
            wsOut.Range("F" & writeRow).Value = "웹 H에서 매칭 키 후보 없음"
            wsOut.Range("G" & writeRow).Value = wsAcc.Range(ACC_U & r).Value
            writeRow = writeRow + 1
        End If

NextAcc:
    Next r

    '==========================
    ' 최종판정
    '==========================
    For r = 2 To lastWeb
        Dim matchedKey8 As String
        matchedKey8 = PickWebKey8(wsWeb.Range(WEB_H & r).Value, dictAccKeyExists)
        If Len(matchedKey8) = 0 Then GoTo SkipRow

        Dim webProdNorm As String
        webProdNorm = NormalizeWebCompare(wsWeb.Range(WEB_D & r).Value)

        '접수검수
        If dictAccProdExists.Exists(matchedKey8 & "|" & webProdNorm) Then
            wsWeb.Range(WEB_BN & r).Value = "O"
        Else
            If dictAccKeyExists.Exists(matchedKey8) Then
                wsWeb.Range(WEB_BN & r).Value = "상품상이"
                wsWeb.Range(WEB_D & r).Interior.Color = vbYellow
            Else
                wsWeb.Range(WEB_BN & r).Value = "접수 X"
            End If
        End If

        '최종판정 처리
        Dim combOK As Boolean, accOK As Boolean, accMissing As Boolean
        combOK = (Trim(wsWeb.Range(WEB_BM & r).Value) = "O")
        accOK = (wsWeb.Range(WEB_BN & r).Value = "O")
        accMissing = (wsWeb.Range(WEB_BN & r).Value = "접수 X")

        Dim finalVal As String
        If accOK And combOK Then
            finalVal = "정상"
        ElseIf (Not combOK) And accOK Then
            finalVal = "결합누락"
        ElseIf combOK And accMissing Then
            finalVal = "접수누락"
        ElseIf (Not combOK) And accMissing Then
            finalVal = "접수·결합 누락"
        Else
            finalVal = "확인필요"
        End If

        wsWeb.Range(WEB_BO & r).Value = finalVal

SkipRow:
    Next r

    wsOut.Columns("A:G").AutoFit

    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic

    MsgBox "검수 및 웹미존재_접수건 처리 완료", vbInformation

End Sub

'=========================================================
' 정규화 함수: 웹 D열 (대소문자 유지, 공백 제거만)
'=========================================================
Private Function NormalizeWebCompare(ByVal txt As String) As String
    Dim s As String
    s = Trim(txt)

    ' 공백, 추단, 괄호, + 제거
    s = Replace(s, "(추단)", "")
    
    ' TV 모든G 체크
    If InStr(s, "TV모든G") > 0 Or InStr(s, "TV 모든 G") > 0 Then
        NormalizeWebCompare = "TV모든G"
        Exit Function
    End If

    s = Replace(s, " ", "")
    s = Replace(s, "(", "")
    s = Replace(s, ")", "")
    s = Replace(s, "+", "")

    ' TV 관련 상품
    If InStr(s, "TV베이직") > 0 Then
        NormalizeWebCompare = "TV베이직": Exit Function
    End If

    ' 패밀리 베이직 → 베이직
    If InStr(s, "패밀리베이직") > 0 Then
        NormalizeWebCompare = "베이직": Exit Function
    End If

    ' 오피스넷
    If InStr(s, "오피스넷") > 0 Then
        If InStr(s, "1G") > 0 Then NormalizeWebCompare = "오피스넷에센스"
        If InStr(s, "500M") > 0 Then NormalizeWebCompare = "오피스넷베이직"
        If InStr(s, "100M") > 0 Then NormalizeWebCompare = "오피스넷슬림"
        Exit Function
    End If

    ' 일반 인터넷 속도
    If InStr(s, "100M") > 0 Then NormalizeWebCompare = "슬림"
    If InStr(s, "500M") > 0 Then NormalizeWebCompare = "베이직"
    If InStr(s, "1G") > 0 Then NormalizeWebCompare = "에센스"

End Function

'=========================================================
' 정규화 함수: 접수 AK열 (대소문자 유지)
'=========================================================
Private Function NormalizeAccCompare(ByVal txt As String) As String
    Dim s As String
    s = Trim(txt)

    ' 접두어 제거
    s = Replace(s, "지니", "")
    s = Replace(s, "인터넷", "")
    s = Replace(s, " ", "")

    NormalizeAccCompare = s
End Function

'=========================================================
' 숫자만 추출
'=========================================================
Private Function DigitsOnly(ByVal v As Variant) As String
    Dim s As String, i As Long, ch As String, out As String
    s = CStr(v): out = ""
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch Like "#" Then out = out & ch
    Next i
    DigitsOnly = out
End Function

'=========================================================
' 앞 6자리 숫자 추출
'=========================================================
Private Function Left6Digits(ByVal v As Variant) As String
    Dim d As String
    d = DigitsOnly(v)
    If Len(d) >= 6 Then Left6Digits = Left$(d, 6) Else Left6Digits = ""
End Function

'=========================================================
' 8자리 후보 키 추출 (웹 H 등)
'=========================================================
Private Function ExtractKey8Candidates(ByVal anyValue As Variant) As Collection
    Dim s As String, i As Long, ch As String, curDigits As String
    Dim col As New Collection, seen As Object
    Set seen = CreateObject("Scripting.Dictionary")
    seen.CompareMode = 1
    s = CStr(anyValue)
    curDigits = ""

    For i = 1 To Len(s) + 1
        If i <= Len(s) Then
            ch = Mid$(s, i, 1)
        Else
            ch = " "
        End If

        If ch Like "#" Then
            curDigits = curDigits & ch
        Else
            If Len(curDigits) >= 8 Then
                Dim key8 As String
                If Left$(curDigits, 1) = "0" Then
                    key8 = Right$(curDigits, 8)
                Else
                    key8 = Left$(curDigits, 8)
                End If
                If Not seen.Exists(key8) Then
                    seen.Add key8, True
                    col.Add key8
                End If
            End If
            curDigits = ""
        End If
    Next i

    Set ExtractKey8Candidates = col
End Function

'=========================================================
' 웹 H 값 중 접수 키 딕셔너리에서 찾기
'=========================================================
Private Function PickWebKey8(ByVal webH As Variant, ByVal dictAccKeyExists As Object) As String
    Dim webKeys As Collection, cand As Variant
    Set webKeys = ExtractKey8Candidates(webH)
    For Each cand In webKeys
        If dictAccKeyExists.Exists(CStr(cand)) Then
            PickWebKey8 = CStr(cand)
            Exit Function
        End If
    Next cand

    Dim webDigits As String, webLast4 As String, key As Variant
    webDigits = DigitsOnly(webH)
    If Len(webDigits) >= 4 Then
        webLast4 = Right$(webDigits, 4)
        For Each key In dictAccKeyExists.keys
            If Right$(CStr(key), 4) = webLast4 Then
                PickWebKey8 = CStr(key)
                Exit Function
            End If
        Next key
    End If

    If webKeys.Count > 0 Then
        PickWebKey8 = CStr(webKeys(1))
    Else
        PickWebKey8 = ""
    End If
End Function

'=========================================================
' 시트 컬럼 번호 반환
'=========================================================
Public Function ColNum(ByVal ws As Worksheet, ByVal colLetter As String) As Long
    ColNum = ws.Range(colLetter & "1").Column
End Function

'=========================================================
' 마지막 행 번호 반환
'=========================================================
Public Function LastRow(ByVal ws As Worksheet, ByVal col As Long) As Long
    LastRow = ws.Cells(ws.Rows.Count, col).End(xlUp).Row
End Function

'=========================================================
' 헤더 보장
'=========================================================
Public Sub EnsureHeader(ByVal ws As Worksheet, ByVal headerRow As Long, ByVal colLetter As String, ByVal headerText As String)
    If Trim(CStr(ws.Range(colLetter & headerRow).Value)) = "" Then
        ws.Range(colLetter & headerRow).Value = headerText
        ws.Range(colLetter & headerRow).Font.Bold = True
    End If
End Sub

'=========================================================
' 웹미존재_접수건 시트 생성/초기화
'=========================================================
Private Function PrepareOutSheet(ByVal sheetName As String) As Worksheet
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = sheetName
    Else
        ws.Cells.Clear
    End If
    Set PrepareOutSheet = ws
End Function

'=========================================================
' 웹미존재_접수건 시트 헤더 작성
'=========================================================
Private Sub WriteOutHeader(ByVal wsOut As Worksheet)
    wsOut.Range("A1").Value = "고객명"
    wsOut.Range("B1").Value = "서비스번호(X)"
    wsOut.Range("C1").Value = "인터넷계약번호(W)"
    wsOut.Range("D1").Value = "상품(AK)"
    wsOut.Range("E1").Value = "접수행"
    wsOut.Range("F1").Value = "비고"
    wsOut.Range("G1").Value = "상태"
    wsOut.Rows(1).Font.Bold = True
End Sub
