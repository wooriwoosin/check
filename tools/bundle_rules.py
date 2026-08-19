import re, collections
BUND_YAKJEONG = re.compile(r'프리미엄|정액|총액|요즘가족|가족결합|결합')
NEG = re.compile(r'^(x|X|없음|미신청|불가|해당없음|무|없슴|-)$')
# 서식지 '라벨'로만 쓰이는 문구 → 결합 신호에서 제외
LABELS = ['모바일 결합 할인', '모바일결합 할인', '월요금/모바일', '결합전', '결합 전', '결합후', '결합 후', '결합불가', '결합 불가']
POS_KW = ['총액결합','모바일결합','머바일결합','모결','프리미엄가족결합','프가결','프리미엄싱글','프싱',
          '패밀리결합','정액결합','홈결합','알뜰폰결합','알뜰결합','요즘가족결합','요즘 가족 결합','결합예정','프리미엄가족']
NAME_TAGS = {'모','모결','결','(모)','알뜰결합','패밀리','(팸)','팸','모바일결합','총액결합'}
FIELD = re.compile(r'결합\s*(?:여부)?\s*[:：]\s*([^\n■□ㅁ●★]{0,25})')

def rrn6(s):
    d=re.sub(r'\D','',s or '')
    return d[:6] if len(d)>=6 else ''
def custkey(d):
    d2=re.sub(r'\D','',d.get('주민번호') or '')
    return d2[:13] if len(d2)>=13 else (d2 or ('P'+re.sub(r'\D','',d.get('명의자 연락처') or '')))

def scrub(t):
    for l in LABELS: t=t.replace(l,'')
    return t

def bundle_signals(d, mobile_by_cust=None):
    """결합 신호 수집. (근거리스트, 확신도) 반환"""
    sig=[]
    ck=custkey(d)
    if mobile_by_cust and ck in mobile_by_cust:
        sig.append(('강', f"모바일_KT 결합회선 존재(약정={mobile_by_cust[ck]})"))
    ya=(d.get('약정') or '').strip()
    if ya and BUND_YAKJEONG.search(ya):
        sig.append(('강', f"약정={ya}"))
    opt=(d.get('상품옵션') or '')
    if '패밀리' in opt:
        sig.append(('중', f"상품옵션에 패밀리({opt})"))
    for t in [x.strip() for x in (d.get('고객명') or '').split('/')[1:]]:
        if t in NAME_TAGS:
            sig.append(('중', f"고객명 속성={t}"))
    ba = scrub(d.get('기타') or '')
    for m in FIELD.finditer(ba):
        v=m.group(1).strip().rstrip(',.')
        if v and not NEG.match(v):
            sig.append(('강', f"기타 '결합:{v}'"))
    flat=ba.replace(' ','')
    for k in POS_KW:
        if k.replace(' ','') in flat:
            sig.append(('중', f"기타 키워드 '{k}'"))
    seen=set(); out=[]
    for lv,txt in sig:
        if txt in seen: continue
        seen.add(txt); out.append((lv,txt))
    return out

def build_mobile_index(rows):
    idx={}
    for d in rows:
        if d.get('상품명')=='모바일_KT':
            ya=(d.get('약정') or '').strip()
            if BUND_YAKJEONG.search(ya):
                idx[custkey(d)]=ya
    return idx
