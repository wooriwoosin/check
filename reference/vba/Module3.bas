Public Sub 검수_00_초기화_헤더유지_행삭제()

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

    '웹: 2행부터 데이터
    DeleteRowsFrom "웹", 2

    '접수/결합: 3행부터 데이터
    DeleteRowsFrom "접수", 3
    DeleteRowsFrom "결합", 3

    '웹미존재: 2행부터 데이터(없으면 그냥 통과)
    DeleteRowsFrom "웹미존재_접수건", 2

    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic

    MsgBox "초기화 완료!" & vbCrLf & _
           "- 웹: 2행부터 삭제" & vbCrLf & _
           "- 접수/결합: 3행부터 삭제" & vbCrLf & _
           "- 웹미존재_접수건: 2행부터 삭제", vbInformation

End Sub

'=========================================================
' sheetName 시트에서 startRow ~ 마지막 데이터행까지 "행 삭제"
' (행 삭제라 값/서식/색/조건부서식 잔여까지 싹 정리됨)
'=========================================================
Private Sub DeleteRowsFrom(ByVal sheetName As String, ByVal startRow As Long)

    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim lastCell As Range
    On Error Resume Next
    Set lastCell = ws.Cells.Find(What:="*", After:=ws.Range("A1"), _
                                 LookIn:=xlFormulas, LookAt:=xlPart, _
                                 SearchOrder:=xlByRows, SearchDirection:=xlPrevious, _
                                 MatchCase:=False)
    On Error GoTo 0

    If lastCell Is Nothing Then Exit Sub '시트가 완전 빈 경우

    Dim LastRow As Long
    LastRow = lastCell.Row

    If LastRow >= startRow Then
        ws.Rows(startRow & ":" & LastRow).Delete
    End If

End Sub
