import time
import requests
from datetime import datetime

URL = "https://bandara-os-api.onrender.com/health"
INTERVALO = 600  # 10 minutos

print(f"[keep_alive] Iniciado. Pingando {URL} a cada {INTERVALO//60} minutos.")

while True:
    try:
        resp = requests.get(URL, timeout=30)
        print(f"[{datetime.now().strftime('%d/%m %H:%M')}] OK {resp.status_code}")
    except Exception as e:
        print(f"[{datetime.now().strftime('%d/%m %H:%M')}] ERRO: {e}")
    time.sleep(INTERVALO)
