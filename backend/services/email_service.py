import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)

async def send_registration_email(registration_data: dict):
    """Отправка email после регистрации"""
    try:
        print("=" * 60)
        print("📧 ПИСЬМО АГЕНТУ: ПОДТВЕРЖДЕНИЕ РЕГИСТРАЦИИ")
        print("=" * 60)
        print(f"Кому: {registration_data.get('email')}")
        print(f"Тема: Подтверждение регистрации в DMC OS")
        print("-" * 60)
        print(f"""
Здравствуйте, {registration_data.get('full_name')}!

Спасибо за регистрацию в DMC OS!

✅ Ваша заявка принята в обработку.
🆔 Application ID: {registration_data.get('application_id')}
🏢 Компания: {registration_data.get('company_name')}
📧 Email: {registration_data.get('email')}
📞 Телефон: {registration_data.get('phone')}
🌍 Страна: {registration_data.get('country')}
🏙️ Город: {registration_data.get('city')}

📌 Статус: Ожидает проверки

Наша команда рассмотрит вашу заявку в течение 24-48 часов.
Вы получите уведомление на этот email о результате проверки.

Если у вас есть вопросы, пожалуйста, свяжитесь с нами.

С уважением,
Команда DMC OS
        """)
        print("=" * 60)
        return True
    except Exception as e:
        logger.error(f"Email error: {e}")
        return False


async def send_approval_email(data: dict):
    """Отправка письма об одобрении"""
    try:
        print("=" * 60)
        print("📧 ПИСЬМО АГЕНТУ: РЕГИСТРАЦИЯ ОДОБРЕНА")
        print("=" * 60)
        print(f"Кому: {data.get('email')}")
        print(f"Тема: Регистрация в DMC OS одобрена")
        print("-" * 60)
        print(f"""
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
        """)
        print("=" * 60)
        return True
    except Exception as e:
        logger.error(f"Approval email error: {e}")
        return False


async def send_rejection_email(data: dict):
    """Отправка письма об отклонении"""
    try:
        print("=" * 60)
        print("📧 ПИСЬМО АГЕНТУ: РЕГИСТРАЦИЯ ОТКЛОНЕНА")
        print("=" * 60)
        print(f"Кому: {data.get('email')}")
        print(f"Тема: Регистрация в DMC OS отклонена")
        print("-" * 60)
        print(f"""
Здравствуйте, {data.get('full_name')}!

К сожалению, ваша регистрация в DMC OS была ОТКЛОНЕНА.

Application ID: {data.get('application_id')}
Причина: {data.get('reason')}

Если у вас есть вопросы, пожалуйста, свяжитесь с нами.

С уважением,
Команда DMC OS
        """)
        print("=" * 60)
        return True
    except Exception as e:
        logger.error(f"Rejection email error: {e}")
        return False