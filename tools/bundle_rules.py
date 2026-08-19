# -*- coding: utf-8 -*-
"""
결합 검수 규칙 (웹 1차) — 프로토타입

검수 대상: KT 유선 전체 (셋트유형 무관)

  셋트유형(DPS/단독)은 '유선끼리 묶음' 축이고, 모바일결합은 그와 별개 축이다.
  DPS(인터넷+TV 동시가입) 건에도 "기존 KT 휴대폰과 묶어달라"는 요청이 들어올 수 있으므로
  단독/DPS 구분 없이 전 건을 훑는다.

결합 유형 2가지:
  유형1 (유무선결합)  기존에 쓰던 KT 휴대폰 + 유선신규 → 결합
                     ※ KT망 알뜰폰(MVNO)도 결합 대상. 우리가 묶어줘야 함
  유형2 (유선전화결합) 기존에 쓰던 KT 일반전화(02·0XX)/인터넷전화(070) + 유선신규 → 결합

셋트유형별 처리:
  단독*  → 전산에서 무조건 '결합X' 로 잡히므로, 요청이 있으면 웹에서 반드시 잡아야 함 (우선순위 높음)
  DPS*   → 전산 결합리스트와 대조 가능. 요청이 있는데 결합리스트에 없으면 누락 (참고용)

검수 제외:
  - 패밀리 계열     : 유선+유선 결합이라 KT전산 로우데이터로 확인 불가
  - 모바일_KT       : 유선/무선 동시가입 건은 별도 검수 프로세스
  - 고객별도진행/고객센터 안내 : 고객이 직접 처리 → 우리가 안 걸어줌
  - '앞으로 KT 휴대폰 가입해서 결합 예정' : 아직 결합 대상 아님
"""
import re

# 결합 검수 대상 = KT전산 이관 대상 (kt_filter.INCLUDE_PRODUCTS 와 동일)
from kt_filter import INCLUDE_PRODUCTS as KT_WIRE_PRODUCTS  # noqa: E402

# ── 노이즈: '결합'/'모바일' 이 들어가지만 결합 신호가 아닌 문구 ──────────────
NOISE = [
    '월요금/모바일 결합 할인금액', '모바일 결합 할인', '모바일결합 할인',
    '청구매체: 모바일', '청구매체:모바일', '모바일청구', '모바일 청구',
    '본인인증: 모바일 인증', '모바일 인증',
    '이마트모바일', '이마트 모바일', '모바일 상품권', '모바일 다이소',
    '결합전', '결합 전', '결합후', '결합 후',
]
# 서식지의 '보기 목록' — 결합상품명이 전부 나열돼 있어 키워드가 통째로 걸린다.
#   예) · 결합유형 (프가=1/ 프싱=2/ 총액=3/ 정액=4/ 신혼미리결합=5) :1
# 목록 부분은 지우고, 뒤에 선택된 번호만 값으로 해석한다.
CHOICE_LIST = re.compile(r'결합유형\s*\(([^)]*=\s*\d[^)]*)\)\s*[:：]?\s*([0-9]?)')
CHOICE_MAP = {'1': '프리미엄가족결합', '2': '프리미엄싱글', '3': '총액결합',
              '4': '정액결합', '5': '신혼미리결합'}

# 향후 가입 후 결합 예정 → 지금은 대상 아님
FUTURE = re.compile(r'(나중에|추후|이후에|다음에)[^\n]{0,20}결합|결합[^\n]{0,12}(예정|하기로)')
# 결합을 명시적으로 부정하는 문구
NEG_PHRASE = ['결합불가', '결합 불가', '결합안됨', '결합 안됨']
# 고객이 직접 처리 → 우리가 안 걸어줌 (검수 대상 아님)
SELF_SERVE = ['고객별도진행', '고객 별도진행', '고객별도 진행', '고객센터 안내', '고객센터안내',
              '고객센터 문의', '본인진행', '고객직접']
NEG_VALUE = re.compile(r'^(x|X|없음|미신청|불가|해당없음|무|-)\s*$')

# ── 패밀리(유선+유선) → 검수 제외 ────────────────────────────────────────
FAMILY = ['패밀리', '팸']

# ── 유형1: 유무선결합 상품명/키워드 ──────────────────────────────────────
WIRELESS_BUNDLE = [
    '프리미엄싱글', '프리미엄 싱글', '프싱',
    '프리미엄가족결합', '프리미엄가족', '프가결',
    '총액결합', '총액 결합', '총액결합할인',
    '정액결합', '모바일결합', '머바일결합', '모결',
]
NAME_TAGS = {'모', '(모)', '모결', '결'}

# 타사 결합상품명 — KT 건에 적혀 있어도 우리 결합 대상이 아니다
OTHER_CARRIER_BUNDLE = ['요즘가족결합', '요즘 가족 결합', '요가결',
                        '참쉬운가족결합', '가족무한사랑', '투게더']

# ── 유형2: 유선전화 결합 흔적 ───────────────────────────────────────────
LANDLINE_KW = re.compile(
    r'전화\s*[12]\s*[:：]|기존\s*번호|기존번호|팩스용|일반전화|인터넷전화|집전화')
# 해지 대상 회선(이전 통신사)이 적히는 줄 — 결합 근거로 쓰면 안 된다
PREV_CARRIER_LINE = re.compile(r'전\s*통신사|이전\s*통신사|기존\s*통신사|전통신사')
LANDLINE_NO = re.compile(
    r'\b(070[-\s.]?\d{3,4}[-\s.]?\d{4}'
    r'|0(?:2|3[1-3]|4[1-4]|5[1-5]|6[1-4])[-\s.]?\d{3,4}[-\s.]?\d{4})\b')
FEE_DIFF = re.compile(r'결합\s*전\s*[:：]?\s*[\d,\.]+\s*원?\s*/?\s*결합\s*후')

# ── 알뜰폰(MVNO) ───────────────────────────────────────────────────────
MVNO = re.compile(r'알뜰')
# '결합:' 필드
FIELD = re.compile(r'결합\s*(?:여부)?\s*[:：]\s*([^\n■□ㅁ●★]{0,25})')
# 휴대폰번호 + 통신사(KT)
KT_MOBILE = re.compile(r'01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}[^\n]{0,12}?(KT|kt|Kt)')


def strip_noise(text):
    """결합 신호를 가리는 문구 제거. 서식지 보기목록은 선택된 값으로 치환."""
    text = CHOICE_LIST.sub(
        lambda m: '결합: ' + CHOICE_MAP.get(m.group(2), '') if m.group(2) else '', text)
    for n in NOISE:
        text = text.replace(n, '')
    return text


def carrier_of_customer(row, text):
    """명의자가 현재 쓰는 통신사. KT가 아니면 유무선결합이 성립하지 않아 확인 대상."""
    auth = str(row.get('고객인증(값)') or '')
    lines = [l for l in text.split('\n')
             if re.search(r'기존\s*통신사|연락처.*통신사|인증통신사', l)]
    hay = auth + '\n' + '\n'.join(lines)
    if re.search(r'KT|kt|Kt', hay):
        return 'KT'
    if re.search(r'SK|sk|Sk|LG|lg|엘지|U\+', hay):
        return '타사'
    return '불명'


def digits(v):
    return re.sub(r'\D', '', str(v or ''))


def customer_key(row):
    """주민번호 13자리를 고객 식별키로. 없으면 명의자 연락처."""
    rrn = digits(row.get('주민번호'))
    if len(rrn) >= 13:
        return rrn[:13]
    return 'P' + digits(row.get('명의자 연락처'))


def mobile_kt_customers(rows):
    """모바일_KT 동시가입 고객키 집합 (별도 검수 대상 → 결합 검수에서 제외)"""
    return {customer_key(r) for r in rows if r.get('상품명') == '모바일_KT'}


def name_tags(row):
    return [t.strip() for t in str(row.get('고객명') or '').split('/')[1:]]


def judge(row, mobile_kt_keys=frozenset()):
    """KT 유선 1행을 판정 (셋트유형 무관).

    반환: dict(verdict, type, reasons, excluded_by, standalone)
      verdict   : '결합대상' | '확인필요' | '해당없음'
      type      : '유무선결합' | '유선전화결합' | None
      standalone: 셋트유형이 단독 계열인지 (True면 전산에서 결합X로 잡히므로 우선순위 높음)
    """
    raw = str(row.get('기타') or '')
    opt = str(row.get('상품옵션') or '')
    auth = str(row.get('고객인증(값)') or '')
    tags = name_tags(row)
    standalone = str(row.get('셋트유형') or '').startswith('단독')

    # ── 제외 판정 ──────────────────────────────────────────────────
    if customer_key(row) in mobile_kt_keys:
        return _r('해당없음', None, [], '모바일_KT 동시가입(별도 검수)', standalone)
    if any(f in opt for f in FAMILY):
        return _r('해당없음', None, [], f'패밀리 상품({opt}) — 유선+유선결합', standalone)

    text = strip_noise(raw)
    for p in NEG_PHRASE:
        if p in text:
            return _r('해당없음', None, [], f'명시적 부정({p})', standalone)

    # '결합:' 필드값
    field_vals = []
    for m in FIELD.finditer(text):
        v = m.group(1).strip().rstrip(',.')
        if v and not NEG_VALUE.match(v):
            field_vals.append(v)
    if any(any(f in v for f in FAMILY) for v in field_vals):
        return _r('해당없음', None, [], '결합 필드값이 패밀리 — 유선+유선결합', standalone)
    if any(any(p in v.replace(' ', '') for p in
               [x.replace(' ', '') for x in SELF_SERVE]) for v in field_vals):
        return _r('해당없음', None, [], '고객이 직접 진행 — 우리가 안 걸어줌', standalone)
    other = [v for v in field_vals
             if any(o.replace(' ', '') in v.replace(' ', '') for o in OTHER_CARRIER_BUNDLE)]
    if other:
        return _r('해당없음', None, [], f'타사 결합상품({other[0]}) — KT 결합 아님', standalone)

    flat = text.replace(' ', '')
    reasons, btype = [], None

    # ── 유형1: 유무선결합 ────────────────────────────────────────────
    for v in field_vals:
        if any(k.replace(' ', '') in v.replace(' ', '') for k in WIRELESS_BUNDLE):
            reasons.append(f"결합 필드 '{v}'"); btype = '유무선결합'
    # 키워드는 가장 긴 것 하나만 (총액결합/총액결합할인 중복 방지)
    matched = [k for k in WIRELESS_BUNDLE if k.replace(' ', '') in flat]
    if matched:
        longest = max(matched, key=lambda k: len(k.replace(' ', '')))
        reasons.append(f"키워드 '{longest}'"); btype = btype or '유무선결합'
    for t in tags:
        if t in NAME_TAGS:
            reasons.append(f"고객명 속성 '{t}'"); btype = btype or '유무선결합'
    if btype == '유무선결합':
        kt_no = _kt_mobile_near_bundle(text)
        if kt_no:
            reasons.append(f"KT 휴대폰 번호 명시({kt_no})")
        if MVNO.search(auth) or MVNO.search(text):
            reasons.append('KT망 알뜰폰 — 우리가 묶어줘야 함')

    # ── 유형2: 유선전화 결합 ─────────────────────────────────────────
    #    '전통신사 : LGU+ 070-...' 처럼 해지 대상 회선이 적힌 줄은 제외한다
    landline = _landline_evidence(raw)
    if landline:
        reasons.extend(landline)
        btype = '유무선+유선전화결합' if btype == '유무선결합' else '유선전화결합'

    # ── 향후 가입 후 결합 예정 → 지금은 대상 아님 ──────────────────────
    #    단, 결합상품이 명시됐거나 기존 KT 번호가 적혀 있으면 진짜 요청으로 본다
    only_future = all(re.search(r'예정|추후|나중', v) for v in field_vals) if field_vals else True
    if FUTURE.search(text) and only_future and not _kt_mobile_near_bundle(text):
        return _r('해당없음', None, reasons,
                  '향후 가입 후 결합 예정 — 현재 대상 아님', standalone)

    # ── 분류 안 된 결합 필드값 ──────────────────────────────────────
    leftover = [v for v in field_vals
                if not any(k.replace(' ', '') in v.replace(' ', '') for k in WIRELESS_BUNDLE)]
    if leftover and not btype:
        return _r('확인필요', None, [f"결합 필드 '{v}'" for v in leftover], None, standalone)

    if not reasons:
        return _r('해당없음', None, [], None, standalone)

    # ── 명의자 통신사가 KT가 아니면 유무선결합 불가 ──────────────────────
    #    유선전화 결합(유형2)은 휴대폰 통신사와 무관하므로 이 규칙을 타지 않는다
    if btype == '유무선결합' and not _kt_mobile_near_bundle(text):
        if carrier_of_customer(row, text) == '타사':
            return _r('해당없음', btype, reasons,
                      f'명의자 통신사가 KT 아님({auth or "미기재"}) — KT 유무선결합 불가',
                      standalone)

    return _r('결합대상', btype, reasons, None, standalone)


def _landline_evidence(raw):
    """기존 유선전화(일반전화/인터넷전화) 결합 근거를 수집.

    '전통신사 : LGU+ 070-8633-6695' 처럼 해지 대상 회선이 적힌 줄은 근거에서 뺀다.
    """
    explicit, listed = [], []
    for line in raw.split('\n'):
        if PREV_CARRIER_LINE.search(line):
            continue
        nums = LANDLINE_NO.findall(line)
        if not nums:
            continue
        (explicit if '결합' in line else
         listed if LANDLINE_KW.search(line) else []).extend(nums)
    out = []
    if explicit:
        out.append(f"기존 유선전화 결합 요청({', '.join(dict.fromkeys(explicit))})")
    if listed:
        out.append(f"기존 유선전화 번호 표기({', '.join(dict.fromkeys(listed))})")
    if out and FEE_DIFF.search(raw):
        out.append('결합 전/후 요금 차이 기재')
    return out


def _kt_mobile_near_bundle(text):
    """'결합' 이 언급된 줄의 KT 휴대폰 번호를 우선 반환.
    (연락처 줄의 알뜰폰 번호가 아니라, 실제 결합 대상 번호를 집기 위함)"""
    for line in text.split('\n'):
        if '결합' in line:
            m = KT_MOBILE.search(line)
            if m:
                return m.group(0).strip()
    m = KT_MOBILE.search(text)
    return m.group(0).strip() if m else None


def _r(verdict, btype, reasons, excluded_by, standalone=False):
    return {'verdict': verdict, 'type': btype, 'reasons': reasons,
            'excluded_by': excluded_by, 'standalone': standalone}
