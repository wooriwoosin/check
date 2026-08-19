# 분석용 스크립트

문서(`docs/`)의 수치를 뽑을 때 쓴 파이썬 스크립트입니다.
본 검수 도구는 HTML로 만들 예정이라, 이건 **분석 검증용 참고 자료**입니다.

| 파일 | 용도 |
|---|---|
| `parse_web.py` | 웹 로우데이터(`전체고객상품*.xls`, 실제로는 HTML/cp949) 파싱 |
| `bundle_rules.py` | 결합 판정 규칙 프로토타입 (모바일_KT 교차조회 / 결합 필드 파싱 / 속성태그) |

```bash
pip install beautifulsoup4 lxml
python3 -c "from parse_web import load; h,d=load('전체고객상품.xls'); print(len(d))"
```

⚠️ 로우데이터 파일 자체는 개인정보라 커밋하지 않습니다 (`.gitignore` 참고).
