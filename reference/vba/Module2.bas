Option Explicit

Public Sub 검수_02_부가검수_오류만표시()

    Dim wsWeb As Worksheet, wsAcc As Worksheet
    Set wsWeb = ThisWorkbook.Worksheets("웹")
    Set wsAcc = ThisWorkbook.Worksheets("접수")

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

    '--- 설정: 열 위치 ---
    '웹 시트
    Const WEB_H As String = "H"   '서비스번호 포함 열
    Const WEB_AA As String = "AA"
    Const WEB_AB As String = "AB"
    Const WEB_S As String = "S"
    Const WEB_P As String = "P"
    Const WEB_Q As String = "Q"
    Const WEB_AX As String = "AX"
    Const WEB_L As String = "L"
    Const WEB_AG As String = "AG" '고객연락처

    '접수 시트
    Const ACC_X As String = "X"   '서비스번호(마스킹)
    Const ACC_I As String = "I"   '업체명
    Const ACC_U As String = "U"   '상태
    Const ACC_AF As String = "AF" '고객연락처(마스킹)

    Const COLOR_WARN As Long = 10092543

    Dim lastWeb As Long, lastAcc As Long
    lastWeb = wsWeb.Cells(wsWeb.Rows.Count, WEB_H).End(xlUp).Row
    lastAcc = wsAcc.Cells(wsAcc.Rows.Count, ACC_X).End(xlUp).Row
    
    If lastWeb < 2 Then GoTo SafeExit

    '이전 색 초기화
    wsWeb.Range(WEB_AA & "2:" & WEB_AA & lastWeb).Interior.ColorIndex = xlNone
    wsWeb.Range(WEB_AB & "2:" & WEB_AB & lastWeb).Interior.ColorIndex = xlNone
    wsWeb.Range(WEB_P & "2:" & WEB_P & lastWeb).Interior.ColorIndex = xlNone
    wsWeb.Range(WEB_AX & "2:" & WEB_AX & lastWeb).Interior.ColorIndex = xlNone
    wsWeb.Range(WEB_L & "2:" & WEB_L & lastWeb).Interior.ColorIndex = xlNone

    '--- 접수 데이터 인덱싱 (복합키: 서비스번호8자리_전화번호앞5자리) ---
    Dim dictKeyToI As Object: Set dictKeyToI = CreateObject("Scripting.Dictionary")
    Dim dictKeyToU As Object: Set dictKeyToU = CreateObject("Scripting.Dictionary")
    dictKeyToI.CompareMode = 1
    dictKeyToU.CompareMode = 1

    Dim r As Long, keys As Collection, k As Variant
    Dim iVal As String, uVal As String, accPhoneHead As String

    For r = 3 To lastAcc
        ' 1. 서비스번호 후보 추출
        Set keys = ExtractKey8Candidates_02(wsAcc.Range(ACC_X & r).Value)
        If keys.Count = 0 Then GoTo NextAcc

        ' 2. 연락처 "앞에서부터 숫자 5자리" 추출
        accPhoneHead = GetPhoneHead(wsAcc.Range(ACC_AF & r).Value)

        iVal = Trim$(CStr(wsAcc.Range(ACC_I & r).Value))
        uVal = Trim$(CStr(wsAcc.Range(ACC_U & r).Value))

        For Each k In keys
            ' 복합키 생성 (서비스번호_010XX)
            Dim compositeKey As String
            compositeKey = CStr(k) & "_" & accPhoneHead

            If Not dictKeyToI.Exists(compositeKey) Then
                dictKeyToI.Add compositeKey, iVal
                dictKeyToU.Add compositeKey, uVal
            End If
        Next k
NextAcc:
    Next r

    '--- 웹 데이터 검수 ---
    Dim webCompositeKey As String
    Dim accI As String, accU As String
    Dim aaText As String, webAB As String
    Dim qText As String, awText As String
    Dim webL As String, webPhoneHead As String
    Dim sVal As Variant, pVal As Variant, expectP As Date

    For r = 2 To lastWeb
        ' 웹 시트 전화번호 "앞에서부터 숫자 5자리" 추출
        webPhoneHead = GetPhoneHead(wsWeb.Range(WEB_AG & r).Value)
        
        ' 복합 키로 매칭되는 접수 데이터 찾기
        webCompositeKey = PickWebKey8_WithPhone(wsWeb.Range(WEB_H & r).Value, webPhoneHead, dictKeyToI)
        
        ' 매칭되는 데이터가 없으면 패스
        If Len(webCompositeKey) = 0 Then GoTo NextWeb

        accI = dictKeyToI(webCompositeKey)
        accU = dictKeyToU(webCompositeKey)
        webAB = Trim$(CStr(wsWeb.Range(WEB_AB & r).Value))

        ' [1] 업체 검수 (웹 AB ↔ 접수 I)
        Dim cmpAcc As String, cmpWeb As String
        cmpAcc = Trim$(Replace(accI, "우리정보통신_", ""))
        cmpAcc = Replace(cmpAcc, "주식회사 ", "")
        cmpAcc = Replace(cmpAcc, "(주)", "")
        
        ' ★ 추가된 로직: 웹 시트 업체명에서 괄호()와 그 안의 내용 모두 삭제
        cmpWeb = RemoveParentheses(webAB)

        If cmpAcc <> cmpWeb Then
            wsWeb.Range(WEB_AB & r).Interior.Color = COLOR_WARN
        End If

        ' [2] AA 규칙 검증
        aaText = CStr(wsWeb.Range(WEB_AA & r).Value)
        If webAB = "(KT)온라인" Then
            If aaText <> "1.유KT-우리(온라인)(월☆통15)" Then wsWeb.Range(WEB_AA & r).Interior.Color = COLOR_WARN
        End If
        If webAB <> "(KT)온라인" Then
            If aaText <> "1.유KT-우리(도매)(동판O)" Then wsWeb.Range(WEB_AA & r).Interior.Color = COLOR_WARN
        End If

        ' [3] 개통기한 P
        sVal = wsWeb.Range(WEB_S & r).Value
        pVal = wsWeb.Range(WEB_P & r).Value
        If IsDate(sVal) And IsDate(pVal) Then
            expectP = EOMonth_02(CDate(sVal), 1)
            If DateValue(CDate(pVal)) <> DateValue(expectP) Then wsWeb.Range(WEB_P & r).Interior.Color = COLOR_WARN
        End If

        ' [4] 판매점 AX
        qText = CStr(wsWeb.Range(WEB_Q & r).Value)
        If InStr(qText, "□") > 0 Or InStr(qText, "■") > 0 Then
            awText = Trim$(CStr(wsWeb.Range(WEB_AX & r).Value))
            If awText <> "5.판매점☆" Then wsWeb.Range(WEB_AX & r).Interior.Color = COLOR_WARN
        End If

        ' [5] 개통상태 L
        webL = Trim$(CStr(wsWeb.Range(WEB_L & r).Value))
        Select Case accU
            Case "사용중"
                If webL <> "개통완료" Then wsWeb.Range(WEB_L & r).Interior.Color = COLOR_WARN
            Case "가설중(예약)"
                If Not (webL = "접수완료" Or webL = "실적확인중") Then wsWeb.Range(WEB_L & r).Interior.Color = COLOR_WARN
            Case "해지"
                If Not (webL = "해지(철회)완료" Or webL = "해지(철회)중" Or webL = "취소완료") Then wsWeb.Range(WEB_L & r).Interior.Color = COLOR_WARN
        End Select

NextWeb:
    Next r

SafeExit:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    MsgBox "02 완료! (업체명 괄호 자동삭제 적용 완료!)", vbInformation
End Sub

'--- 도움 함수들 ---

' ★ 핵심: 텍스트에서 괄호 `()` 와 그 안의 내용을 모두 지워주는 함수
Private Function RemoveParentheses(ByVal txt As String) As String
    Dim startPos As Long, endPos As Long
    
    startPos = InStr(txt, "(")
    Do While startPos > 0
        endPos = InStr(startPos, txt, ")")
        If endPos > startPos Then
            ' 괄호 시작점 앞부분 + 괄호 끝점 뒷부분만 합치기
            txt = Left$(txt, startPos - 1) & Mid$(txt, endPos + 1)
        Else
            Exit Do ' 닫는 괄호가 없으면 무한루프 방지를 위해 빠져나감
        End If
        startPos = InStr(txt, "(")
    Loop
    
    RemoveParentheses = Trim$(txt)
End Function

' 전화번호 '앞'에서부터 숫자 5자리만 정확히 추출 (010XX)
Private Function GetPhoneHead(ByVal phoneVal As Variant) As String
    Dim s As String, i As Long, res As String, ch As String
    s = CStr(phoneVal)
    res = ""
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If IsNumeric(ch) Then
            res = res & ch
            If Len(res) = 5 Then Exit For
        End If
    Next i
    GetPhoneHead = res
End Function

' 복합 키(번호_전화앞자리)로 매칭 확인
Private Function PickWebKey8_WithPhone(ByVal webH As Variant, ByVal phoneHead As String, ByRef dict As Object) As String
    Dim keys As Collection, k As Variant
    Set keys = ExtractKey8Candidates_02(webH)
    
    For Each k In keys
        Dim testKey As String
        testKey = CStr(k) & "_" & phoneHead
        
        If dict.Exists(testKey) Then
            PickWebKey8_WithPhone = testKey
            Exit Function
        End If
    Next k
    PickWebKey8_WithPhone = ""
End Function

' 숫자 8자리 추출
Private Function ExtractKey8Candidates_02(ByVal anyValue As Variant) As Collection
    Dim s As String, i As Long, ch As String, curDigits As String
    Dim col As New Collection
    s = CStr(anyValue)
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If IsNumeric(ch) Then
            curDigits = curDigits & ch
        Else
            If Len(curDigits) >= 8 Then col.Add Left$(curDigits, 8)
            curDigits = ""
        End If
    Next i
    If Len(curDigits) >= 8 Then col.Add Left$(curDigits, 8)
    Set ExtractKey8Candidates_02 = col
End Function

' 익월 말일 계산
Private Function EOMonth_02(ByVal baseDate As Date, ByVal months As Long) As Date
    EOMonth_02 = DateSerial(Year(DateAdd("m", months + 1, baseDate)), _
                            Month(DateAdd("m", months + 1, baseDate)), 0)
End Function
