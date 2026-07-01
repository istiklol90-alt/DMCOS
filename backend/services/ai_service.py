import logging

logger = logging.getLogger(__name__)


async def analyze_registration(registration_data: dict):
    """AI анализ заявки на регистрацию"""
    try:
        # Базовый анализ без OpenAI
        risk_score = 0
        recommendation = "approve"
        observations = []
        
        # Проверка email
        if "@" not in registration_data.get("email", ""):
            risk_score += 20
            observations.append("Invalid email format")
        
        # Проверка телефона
        phone = registration_data.get("phone", "")
        if len(phone) < 10:
            risk_score += 15
            observations.append("Phone number too short")
        
        # Проверка компании
        company = registration_data.get("company_name", "")
        if len(company) < 2:
            risk_score += 10
            observations.append("Company name too short")
        
        # Определение рекомендации
        if risk_score > 50:
            recommendation = "review"
        elif risk_score > 70:
            recommendation = "reject"
        else:
            recommendation = "approve"
        
        return {
            "risk_score": risk_score,
            "recommendation": recommendation,
            "observations": observations
        }
        
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        return {
            "risk_score": 50,
            "recommendation": "review",
            "observations": ["AI analysis temporarily unavailable"]
        }