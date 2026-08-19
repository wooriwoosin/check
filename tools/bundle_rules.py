# -*- coding: utf-8 -*-
"""
결합 검수 규칙 (웹 1차) — 프로토타입

검수 대상:
  KT 유선 신규 중 셋트유형이 '단독*' 인데, 실제로는 결합을 걸어줘야 하는 건.
  (전산에서는 셋트유형 단독 = 무조건 결합X 로 잡히므로 웹에서 먼저 걸러야 함)

결합 유형 2가지:
  유형1 (유무선결합) 기존에 쓰던 KT 휴대폰 + 유선신규 → 결합
  유형2 (유선전화결합) 기존에 쓰던 KT 일반전화/인터넷전화 + 유선신규 → 결합

제외 대상:
  - 패밀리 계열 : 유선+유선 결합이라 KT전산 로우데이터로 확인 불가
  - 모바일_KT 동시가입 : 유선/무선 동시가입 건은 별도 검수 프로세스
  - '앞으로 KT 휴대폰 가입해서 결합 예정' : 아직 결합 대상 아님
  - 알뜰폰(KT망 MVNO) : KT 유무선결합 대상이 아니므로 확인필요로 분리
"""
import re

KT_WIRE_PRODUCTS = {
    'KT_인터넷', 'KT_TV', 'KT_티_업셀링/전환', 'KT_인_업셀링/전환',
    'KT_TV(약정갱신)', 'KT_인터넷(약정갱신)', 'KT_인터넷전화', 'KT_일반전화',
    '유선기타_(KT-biz)인터넷', '유선기타_(KT-biz)인터넷전화',
}

# ── 노이즈: '결합'/'모바일' 이 들어가지만 결합 신호가 아닌 문구 ──────────────
NOISE = [
    '월요금/모바일 결합 할인금액', '모바일 결합 할인', '모바일결합 할인',
    '청구매체: 모바일', '청구매체:모바일', '모바일청구', '모바일 청구',
    '본인인증: 모바일 인증', '모바일 인증',
    '이마트모바일', '이마트 모바일', '모바일 상품권', '모바일 다이소',
    '결합전', '결합 전', '결합후', '결합 후',
]
# 결합을 명시적으로 부정하는 문구
NEG_PHRASE = ['결합불가', '결합 불가', '결합안됨', '결합 안됨']
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

# ── 유형2: 유선전화 결합 흔적 ───────────────────────────────────────────
LANDLINE_KW = re.compile(r'전화\s*[12]\s*[:：]|기존\s*번호|기존번호|팩스용')
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
    for n in NOISE:
        text = text.replace(n, '')
    return text


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
    """단독 KT유선 1행을 판정.

    반환: dict(verdict, type, reasons, excluded_by)
      verdict : '결합대상' | '확인필요' | '정상단독'
      type    : '유무선결합' | '유선전화결합' | None
    """
    raw = str(row.get('기타') or '')
    opt = str(row.get('상품옵션') or '')
    auth = str(row.get('고객인증(값)') or '')
    tags = name_tags(row)

    # ── 제외 판정 ──────────────────────────────────────────────────
    if customer_key(row) in mobile_kt_keys:
        return _r('정상단독', None, [], '모바일_KT 동시가입(별도 검수)')
    if any(f in opt for f in FAMILY):
        return _r('정상단독', None, [], f'패밀리 상품({opt}) — 유선+유선결합')

    text = strip_noise(raw)
    for p in NEG_PHRASE:
        if p in text:
            return _r('정상단독', None, [], f'명시적 부정({p})')

    # '결합:' 필드값
    field_vals = []
    for m in FIELD.finditer(text):
        v = m.group(1).strip().rstrip(',.')
        if v and not NEG_VALUE.match(v):
            field_vals.append(v)
    if any(any(f in v for f in FAMILY) for v in field_vals):
        return _r('정상단독', None, [], '결합 필드값이 패밀리 — 유선+유선결합')

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

    # ── 유형2: 유선전화 결합 ─────────────────────────────────────────
    if LANDLINE_KW.search(raw) and LANDLINE_NO.search(raw):
        nums = LANDLINE_NO.findall(raw)[:2]
        reasons.append(f"기존 유선전화 번호 표기({', '.join(nums)})")
        btype = btype or '유선전화결합'
    if FEE_DIFF.search(raw):
        reasons.append('결합 전/후 요금 차이 기재')
        btype = btype or '유선전화결합'

    # ── 나머지 결합 필드값 (분류 안 된 것) ────────────────────────────
    leftover = [v for v in field_vals
                if not any(k.replace(' ', '') in v.replace(' ', '') for k in WIRELESS_BUNDLE)]
    if leftover and not btype:
        return _r('확인필요', None,
                  [f"결합 필드 '{v}'" for v in leftover],
                  None, mvno=bool(MVNO.search(auth + raw)))

    if not reasons:
        return _r('정상단독', None, [], None)

    # ── 알뜰폰이면 확신도를 낮춤 ─────────────────────────────────────
    if btype == '유무선결합' and MVNO.search(auth):
        if not KT_MOBILE.search(text):
            return _r('확인필요', btype, reasons + [f'인증통신사 알뜰({auth})'], None, mvno=True)

    return _r('결합대상', btype, reasons, None)


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


def _r(verdict, btype, reasons, excluded_by, mvno=False):
    return {'verdict': verdict, 'type': btype, 'reasons': reasons,
            'excluded_by': excluded_by, 'mvno': mvno}
