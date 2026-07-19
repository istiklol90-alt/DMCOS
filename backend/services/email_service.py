import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
import os
import sys
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def safe_print(text: str):
    """Print that never crashes on consoles whose encoding (e.g. Windows
    cp1252) can't represent emoji/Cyrillic — falls back to replacing any
    unencodable characters instead of raising UnicodeEncodeError."""
    try:
        print(text)
    except UnicodeEncodeError:
        encoding = sys.stdout.encoding or "utf-8"
        print(text.encode(encoding, errors="replace").decode(encoding))

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
            safe_print("SMTP не настроен! Письмо печатается в консоль.")
            safe_print(f"Кому: {to}")
            safe_print(f"Тема: {subject}")
            safe_print(f"Текст: {body}")
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

        safe_print(f"Email отправлен на: {to}")
        return True

    except Exception as e:
        safe_print(f"Ошибка отправки email: {e}")
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


def _render_text_table(rows: list) -> str:
    """Same plain Markdown-pipe-table convention as the frontend's LPO
    (Reservations.tsx) and Price Calculator (PriceCalculator.tsx)
    renderTextTable helpers -- unambiguous as raw plain text even where
    nothing renders it as an actual table, since this becomes a plain-text
    email body, not an HTML surface. First backend use of this convention;
    kept identical rather than inventing a second table format."""
    lines = ["| Поле | Значение |", "|---|---|"]
    for label, value in rows:
        lines.append(f"| {label} | {str(value).replace('|', chr(92) + '|')} |")
    return "\n".join(lines)


def send_booking_confirmation_email(data: dict) -> bool:
    """
    Decision 029 Stage 2: automatic, one-way booking-confirmation email to
    the agent who created a booking -- "automatic email notifications...
    no AI decision-making, just templated notifications", explicitly
    distinguished in that same decision from Stage 3's two-way
    email-reading/sending infrastructure, which BookingCorrespondence
    (Decision 049) deliberately deferred pending a real business mailbox.
    This is purely outbound, so it needed none of that -- it reuses
    send_real_email exactly like send_registration_email/
    send_approval_email/send_rejection_email above: same graceful
    console-log fallback when SMTP isn't configured, same "never raises"
    safety (every real failure mode is already caught inside
    send_real_email itself).

    Deliberately synchronous, unlike the async def functions above --
    booking/api.py's create_booking endpoint is a plain def, not async
    def, and send_real_email's own smtplib calls are already blocking,
    so an async wrapper here would add nothing.

    Every value in `data` is pre-resolved by the caller (booking/api.py,
    which has real access to Hotel/Contract Engine's service functions)
    via the exact same real get_room_price/get_transfer_price/
    get_mandatory_tax functions Reservations.tsx's cost breakdown and the
    LPO generator already call -- this function only formats and sends,
    it never computes a price or resolves a name itself. guest_names is
    the real (often empty, at this early a trigger point) result of
    list_guests -- rendered honestly when empty, never fabricated.
    """
    rows = [
        ("№ брони", data["booking_number"]),
        ("Отель", data["hotel_name"]),
        ("Тип номера", data["room_type_name"]),
        ("Заезд — Выезд", f"{data['arrival_date']} — {data['departure_date']} ({data['nights']} ноч.)"),
        ("План питания", data["meal_plan_name"]),
        ("Заполняемость", f"{data['adults']} взр., {data['children']} дет., {data['infants']} млд."),
        ("Гости", data["guest_names"] or "Гости будут добавлены отдельно"),
        ("Базовая ставка", data["base_total"]),
        ("Надбавки", data["supplements_total"]),
        ("Спецпредложение / промо", data["offer_names"] or "нет"),
        ("Стоимость номера", data["room_total"]),
        (data["tax_label"], data["tax_total"]),
    ]
    if data.get("transfer_name") is not None:
        rows.append((f"Трансфер ({data['transfer_name']})", data["transfer_total"]))
    rows.append(("ИТОГО", data["grand_total"]))

    subject = f"Подтверждение бронирования — {data['booking_number']} — {data['hotel_name']}"
    body = (
        f"Здравствуйте, {data['agent_name']}!\n\n"
        "Ваше бронирование успешно создано.\n\n"
        f"{_render_text_table(rows)}\n\n"
        "С уважением,\nDMC OS"
    )
    return send_real_email(data["agent_email"], subject, body)


def send_invoice_email(data: dict) -> bool:
    """
    Decision 081 (Finance Engine Stage B): plain-text summary sent when
    accounting clicks "Одобрить и отправить" on a Draft invoice --
    same reuse of send_real_email/_render_text_table as
    send_booking_confirmation_email above, same graceful console-log
    fallback (no SMTP configured anywhere in this project yet), same
    "never raises, always best-effort" contract. Deliberately does NOT
    mention bank details or a PDF attachment -- both are Stage C's job,
    not built yet; this email is honest about what actually exists
    today; it never implies an attachment that isn't there.

    Every value in `data` is pre-resolved by the caller
    (finance/service.py's approve_and_send_invoice), same
    caller-resolves/function-only-formats-and-sends split as
    send_booking_confirmation_email.
    """
    rows = [
        ("№ счёта", data["invoice_number"]),
        ("Отель", data["hotel_name"]),
        ("Дата выставления", data["issue_date"]),
        ("Сумма номера (нетто)", data["subtotal"]),
        ("Скидка", data["discount"]),
        ("Комиссия", data["commission"]),
        ("Налог", data["tax"]),
        ("ИТОГО К ОПЛАТЕ", f"{data['total']} {data['currency']}"),
    ]

    subject = f"Счёт {data['invoice_number']} — {data['hotel_name']}"
    body = (
        f"Здравствуйте, {data['agent_name']}!\n\n"
        f"Ваш счёт по бронированию {data['booking_number']} утверждён.\n\n"
        f"{_render_text_table(rows)}\n\n"
        "Подробности доступны в личном кабинете.\n\n"
        "С уважением,\nDMC OS"
    )
    return send_real_email(data["agent_email"], subject, body)