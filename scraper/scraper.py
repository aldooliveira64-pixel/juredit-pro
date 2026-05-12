"""
JUREDITPRO — Fase 2
Item 2.3: Web Scraping estruturado para tribunais sem API pública

Dependências:
    pip install selenium webdriver-manager requests beautifulsoup4 lxml

Uso:
    python scraper.py --tribunal trf3 --termo "responsabilidade civil" --saida resultados.json

Tribunais suportados:
    - trf3  : Tribunal Regional Federal da 3ª Região (SP/MS)
    - tjsc  : Tribunal de Justiça de Santa Catarina
    - tjba  : Tribunal de Justiça da Bahia
    (adicione novos em SCRAPERS_CONFIG)
"""

import argparse
import json
import logging
import re
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('JurEditPro.Scraper')


# ─── Modelo de dados ──────────────────────────────────────────────────────────

@dataclass
class Acordao:
    id: str
    tribunal: str
    numero_processo: str
    classe: str
    orgao_julgador: str
    relator: str
    data_julgamento: str
    ementa: str
    decisao: str
    url: str
    fonte: str = 'scraping'
    score: float = 0.0

    def to_dict(self):
        return asdict(self)


# ─── Configurações dos tribunais ──────────────────────────────────────────────

SCRAPERS_CONFIG = {
    'trf3': {
        'nome': 'TRF 3ª Região',
        'url_busca': 'https://web.trf3.jus.br/acordaos/Acordao/BuscarDocumento',
        'metodo': 'requests',  # usa requests simples (sem JS)
        'params': lambda termo: {
            'q': termo,
            'data_inicial': '01/01/2015',
            'data_final': datetime.now().strftime('%d/%m/%Y'),
        },
    },
    'tjsc': {
        'nome': 'TJSC',
        'url_busca': 'https://busca.tjsc.jus.br/jurisprudencia/',
        'metodo': 'selenium',  # precisa de JS
        'seletor_resultado': '.ementa-text',
        'seletor_relator':   '.relator',
        'seletor_data':      '.data-julgamento',
        'seletor_numero':    '.numero-processo',
    },
    'tjba': {
        'nome': 'TJBA',
        'url_busca': 'https://jurisprudencia.tjba.jus.br/jurisprudencia/openHTTP.wsp',
        'metodo': 'requests',
        'params': lambda termo: {
            'microssistema': 'jurisprudencia',
            'toipage': '1',
            'txtPesquisa': termo,
        },
    },
}


# ─── Driver Selenium ──────────────────────────────────────────────────────────

def criar_driver(headless: bool = True) -> webdriver.Chrome:
    """Cria instância do Chrome headless."""
    opcoes = Options()
    if headless:
        opcoes.add_argument('--headless=new')
    opcoes.add_argument('--no-sandbox')
    opcoes.add_argument('--disable-dev-shm-usage')
    opcoes.add_argument('--disable-gpu')
    opcoes.add_argument('--window-size=1920,1080')
    opcoes.add_argument('--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')

    service = Service(ChromeDriverManager().install())
    driver  = webdriver.Chrome(service=service, options=opcoes)
    driver.set_page_load_timeout(30)
    return driver


# ─── Scrapers específicos ─────────────────────────────────────────────────────

def scrape_trf3(termo: str, max_resultados: int = 10) -> list[Acordao]:
    """Scraper para TRF3 via requests + BeautifulSoup."""
    log.info(f'[TRF3] Buscando: "{termo}"')
    config = SCRAPERS_CONFIG['trf3']
    resultados = []

    try:
        resp = requests.post(
            config['url_busca'],
            data=config['params'](termo),
            timeout=20,
            headers={'User-Agent': 'Mozilla/5.0 JurEditPro/2.0'},
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'lxml')

        cards = soup.select('.resultado-item, .acordao-item, article')[:max_resultados]

        for i, card in enumerate(cards):
            ementa     = card.select_one('.ementa, .texto-ementa, p')
            relator    = card.select_one('.relator, [data-relator]')
            data       = card.select_one('.data, time')
            numero     = card.select_one('.numero, .processo')
            link       = card.select_one('a[href]')

            resultados.append(Acordao(
                id              = f'trf3_{i}_{int(time.time())}',
                tribunal        = 'TRF3',
                numero_processo = numero.get_text(strip=True) if numero else '',
                classe          = '',
                orgao_julgador  = '',
                relator         = relator.get_text(strip=True) if relator else '',
                data_julgamento = data.get_text(strip=True) if data else '',
                ementa          = ementa.get_text(strip=True) if ementa else '',
                decisao         = '',
                url             = link['href'] if link else config['url_busca'],
            ))

    except Exception as e:
        log.error(f'[TRF3] Erro: {e}')

    log.info(f'[TRF3] {len(resultados)} acórdãos encontrados')
    return resultados


def scrape_tjsc(termo: str, max_resultados: int = 10) -> list[Acordao]:
    """Scraper para TJSC via Selenium (página com JavaScript)."""
    log.info(f'[TJSC] Buscando: "{termo}"')
    config     = SCRAPERS_CONFIG['tjsc']
    resultados = []
    driver     = None

    try:
        driver = criar_driver(headless=True)
        driver.get(config['url_busca'])

        wait = WebDriverWait(driver, 15)

        # Localiza campo de busca e digita o termo
        campo = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, 'input[name="q"], #txtPesquisa, input[type="search"]')
        ))
        campo.clear()
        campo.send_keys(termo)

        # Submete
        botao = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"], input[type="submit"]')
        botao.click()

        # Aguarda resultados
        wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, config['seletor_resultado'])
        ))
        time.sleep(2)  # aguarda renderização completa

        soup  = BeautifulSoup(driver.page_source, 'lxml')
        items = soup.select(config['seletor_resultado'])[:max_resultados]

        for i, item in enumerate(items):
            relator = item.find_parent().select_one(config['seletor_relator'])
            data    = item.find_parent().select_one(config['seletor_data'])
            numero  = item.find_parent().select_one(config['seletor_numero'])
            link    = item.find_parent().select_one('a[href]')

            resultados.append(Acordao(
                id              = f'tjsc_{i}_{int(time.time())}',
                tribunal        = 'TJSC',
                numero_processo = numero.get_text(strip=True) if numero else '',
                classe          = '',
                orgao_julgador  = '',
                relator         = relator.get_text(strip=True) if relator else '',
                data_julgamento = data.get_text(strip=True) if data else '',
                ementa          = item.get_text(strip=True),
                decisao         = '',
                url             = link['href'] if link else config['url_busca'],
            ))

    except Exception as e:
        log.error(f'[TJSC] Erro: {e}')

    finally:
        if driver:
            driver.quit()

    log.info(f'[TJSC] {len(resultados)} acórdãos encontrados')
    return resultados


# ─── Dispatcher principal ─────────────────────────────────────────────────────

SCRAPERS = {
    'trf3': scrape_trf3,
    'tjsc': scrape_tjsc,
    # Adicione novos scrapers aqui:
    # 'tjba': scrape_tjba,
}

def buscar(tribunal: str, termo: str, max_resultados: int = 10) -> dict:
    """
    Ponto de entrada principal do scraper.
    Retorna dicionário compatível com o middleware DataJud.
    """
    if tribunal not in SCRAPERS:
        return {
            'erro': f'Tribunal "{tribunal}" não suportado. Disponíveis: {list(SCRAPERS.keys())}',
            'resultados': [],
        }

    scraper    = SCRAPERS[tribunal]
    resultados = scraper(termo, max_resultados)

    return {
        'termo':      termo,
        'tribunal':   tribunal,
        'total':      len(resultados),
        'resultados': [r.to_dict() for r in resultados],
        'fonte':      'scraping',
        'timestamp':  datetime.now().isoformat(),
    }


# ─── CLI ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='JurEditPro — Scraper de Jurisprudência')
    parser.add_argument('--tribunal',      required=True,  help='Ex: trf3, tjsc')
    parser.add_argument('--termo',         required=True,  help='Termo de busca')
    parser.add_argument('--max',           type=int, default=10)
    parser.add_argument('--saida',         default='resultados.json', help='Arquivo JSON de saída')
    args = parser.parse_args()

    resultado = buscar(args.tribunal, args.termo, args.max)

    saida_path = Path(args.saida)
    saida_path.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding='utf-8')

    log.info(f'✅ {resultado["total"]} resultados salvos em {saida_path}')
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
