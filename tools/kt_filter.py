# -*- coding: utf-8 -*-
"""
웹 로우데이터 → KT전산 이관 대상 필터 (1차 웹 검수 W-0)

웹 로우데이터에는 전 통신사 건이 다 들어있다(979건 중 KT는 408건).
KT전산 접수리스트와 대사할 수 있는 건만 남긴다.
"""
import re


# 이관 대상 상품명 (화이트리스트)
INCLUDE_PRODUCTS = (
    'KT_인터넷',
    'KT_TV',
    'KT_부가상품',
    '유선기타_(KT-biz)인터넷',
    '유선기타_(KT-biz)TV',
    'KT_인터넷전화',
    'KT_일반전화',
)

# 이관에서 빼는 상부점·접점 (대성 상권사업부 — 우리 접수 건이 아님)
# 지점이 계속 늘어나므로(평택·수원·경기서부지사·무선 등) 이름 패턴으로 잡는다.
EXCLUDE_PATTERNS = (
    (re.compile(r'대성'), '대성 상권사업부'),
)


def transfer_reason(row):
    """이관 제외 사유. 이관 대상이면 None."""
    product = str(row.get('상품명') or '').strip()
    if product not in INCLUDE_PRODUCTS:
        return f'이관 대상 상품명 아님({product or "미기재"})'
    for pat, label in EXCLUDE_PATTERNS:
        for col in ('상부점', '접점코드'):
            value = str(row.get(col) or '').strip()
            if pat.search(value):
                return f'제외 대상 {label} — {col}="{value}"'
    return None


def split(rows):
    """(이관대상, [(행, 제외사유), ...]) 로 분리."""
    keep, drop = [], []
    for r in rows:
        reason = transfer_reason(r)
        (keep.append(r) if reason is None else drop.append((r, reason)))
    return keep, drop
