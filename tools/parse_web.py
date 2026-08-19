from bs4 import BeautifulSoup
def load(path='web_raw2.xls'):
    raw=open(path,'rb').read().decode('cp949')
    trs=BeautifulSoup(raw,'lxml').find_all('table')[0].find_all('tr')
    hdr=[th.get_text(' ',strip=True) for th in trs[0].find_all(['th','td'])]
    out=[]
    for tr in trs[1:]:
        cells=tr.find_all(['td','th'])
        if len(cells)!=len(hdr): continue
        out.append(dict(zip(hdr,[c.get_text('\n',strip=True) for c in cells])))
    return hdr,out
