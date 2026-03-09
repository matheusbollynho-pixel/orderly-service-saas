import qrcode

# URL da avaliação na loja
url = "https://os-bandara.vercel.app/avaliar/loja"

# Criar QR code
qr = qrcode.QRCode(
    version=1,
    error_correction=qrcode.constants.ERROR_CORRECT_L,
    box_size=10,
    border=4,
)
qr.add_data(url)
qr.make(fit=True)

# Criar imagem
img = qr.make_image(fill_color="black", back_color="white")

# Salvar imagem
img.save("qrcode_avaliacao_loja.png")
print(f"✅ QR Code gerado com sucesso!")
print(f"📱 URL: {url}")
print(f"💾 Salvo em: qrcode_avaliacao_loja.png")
