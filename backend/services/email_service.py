import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Настройки SMTP из .env (теперь Gmail по умолчанию)
SMTP_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("EMAIL_PORT", 587))
SMTP_USER = os.getenv("EMAIL_USER")
SMTP_PASSWORD = os.getenv("EMAIL_PASSWORD")
SMTP_FROM = os.getenv("EMAIL_FROM", SMTP_USER)


def send_real_email(to: str, subject: str, body: str):
    """Отправка реального email через SMTP"""
    try:
        if not SMTP_USER or not SMTP_PASSWORD:
            print("⚠️ SMTP не настроен! Письмо печатается в консоль.")
            print(f"📧 Кому: {to}")
            print(f"📝 Тема: {subject}")
            print(f"📄 Текст: {body}")
            return False

        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        # Для Gmail (порт 587)
        if SMTP_PORT == 587:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            # Для других провайдеров
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)

        print(f"✅ Email отправлен на: {to}")
        return True

    except Exception as e:
        print(f"❌ Ошибка отправки email: {e}")
        return False


async def send_registration_email(data: dict):
    """Отправка письма о регистрации"""
    subject = "Подтверждение регистрации в DMC OS"
    body = f"""
Здравствуйте, {data.get('full_name')}!

Спасибо за регистрацию в DMC OS!

✅ Ваша заявка принята в обработку.
🆔 Application ID: {data.get('application_id')}
🏢 Компания: {data.get('company_name')}
📧 Email: {data.get('email')}
📞 Телефон: {data.get('phone')}
🌍 Страна: {data.get('country')}
🏙️ Город: {data.get('city')}

📌 Статус: Ожидает проверки

Наша команда рассмотрит вашу заявку в течение 24-48 часов.

С уважением,
Команда DMC OS
    """
    return send_real_email(data.get('email'), subject, body)


async def send_approval_email(data: dict):
    """Отправка письма об одобрении"""
    subject = "Регистрация в DMC OS одобрена! 🎉"
    body = f"""
Здравствуйте, {data.get('full_name')}!

Поздравляем! Ваша регистрация в DMC OS ОДОБРЕНА! 🎉

🔑 Данные для входа:
   📧 Email: {data.get('email')}
   🔑 Пароль: {data.get('password')}

⚠️ ВАЖНО: Смените пароль после первого входа.

🌐 Войти: http://localhost:5173/login

Application ID: {data.get('application_id')}

Добро пожаловать в DMC OS!

С уважением,
Команда DMC OS
    """
    return send_real_email(data.get('email'), subject, body)


async def send_rejection_email(data: dict):
    """Отправка письма об отклонении"""
    subject = "Регистрация в DMC OS отклонена"
    body = f"""
Здравствуйте, {data.get('full_name')}!

К сожалению, ваша регистрация в DMC OS была ОТКЛОНЕНА.

Application ID: {data.get('application_id')}
Причина: {data.get('reason')}

Если у вас есть вопросы, пожалуйста, свяжитесь с нами.

С уважением,
Команда DMC OS
    """
    return send_real_email(data.get('email'), subject, body)