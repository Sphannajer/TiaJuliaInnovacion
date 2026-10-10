"""Exportación PDF (sección 34) con ReportLab.

- A4, márgenes 18-20 mm, tipografía legible 10-12 pt mínimo.
- Títulos con colores de marca, tablas con zebra sutil beige/hueso.
- Sin fondos de color oscuro a página completa.
- Sin nombres de clientes por defecto (sección 35).
"""

import io
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select

from app.core.config import settings
from app.infrastructure.db.models import DemandForecastModel, SalesAnomalyModel
from app.infrastructure.db.repositories import inventory_repo as inv_repo

BRAND_RED = colors.HexColor("#C92429")
BRAND_ORANGE = colors.HexColor("#E99015")
BRAND_BEIGE = colors.HexColor("#F2D4A2")
TEXT_MAIN = colors.HexColor("#1B1B1B")
TEXT_SECONDARY = colors.HexColor("#3D3D3D")
BORDER = colors.HexColor("#D7D2C8")

MONEY = "S/ {:,.2f}"
DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _fmt(value) -> str:
    return MONEY.format(float(value or 0))


def _range_bounds(from_day: date, to_day: date) -> tuple[datetime, datetime]:
    tz = ZoneInfo(settings.timezone)
    start = datetime(from_day.year, from_day.month, from_day.day, tzinfo=tz)
    end_day = to_day + timedelta(days=1)
    end = datetime(end_day.year, end_day.month, end_day.day, tzinfo=tz)
    return start, end


def _brand_title(text: str, size: int = 22) -> Paragraph:
    style = ParagraphStyle(
        "BrandTitle",
        fontName="Helvetica-Bold",
        fontSize=size,
        leading=size + 6,
        textColor=BRAND_RED,
        spaceAfter=6,
    )
    return Paragraph(text, style)


def _section_title(text: str) -> Paragraph:
    style = ParagraphStyle(
        "SectionTitle",
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=TEXT_MAIN,
        spaceBefore=14,
        spaceAfter=6,
    )
    return Paragraph(text, style)


def _paragraph(text: str, size: int = 11, color=TEXT_SECONDARY) -> Paragraph:
    style = ParagraphStyle(
        "Body",
        fontName="Helvetica",
        fontSize=size,
        leading=size + 4,
        textColor=color,
    )
    return Paragraph(text, style)


def _zebra(data: list[list[str]], widths=None, align_right_from: int = 1) -> Table:
    table = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    style: list[tuple] = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_ORANGE),
        ("TEXTCOLOR", (0, 1), (-1, -1), TEXT_MAIN),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (align_right_from, 1), (-1, -1), "RIGHT"),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), BRAND_BEIGE))
    table.setStyle(TableStyle(style))
    return table


def generate_report_pdf(
    db,
    from_day: date,
    to_day: date,
    sections: list[str],
    brand_asset_path: str | None = None,
) -> bytes:
    """Build the report PDF and return raw bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=19 * mm,
        rightMargin=19 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title="Reporte Tía Julia",
    )
    story: list = []

    # 1. Logo y título
    if brand_asset_path:
        try:
            logo = Image(brand_asset_path, width=20 * mm, height=20 * mm)
            header = Table([[logo, _brand_title("Tía Julia — Reporte de ventas")]], colWidths=[24 * mm, None])
            header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
            story.append(header)
        except Exception:  # pragma: no cover - decorative only
            story.append(_brand_title("Tía Julia — Reporte de ventas"))
    else:
        story.append(_brand_title("Tía Julia — Reporte de ventas"))

    # 2. Periodo + 3. fecha/hora de generación
    generated = datetime.now(ZoneInfo(settings.timezone)).strftime("%d/%m/%Y %H:%M")
    story.append(
        _paragraph(
            f"Periodo: {from_day.strftime('%d/%m/%Y')} – {to_day.strftime('%d/%m/%Y')} · Generado: {generated}"
        )
    )
    story.append(Spacer(1, 8))

    start, end = _range_bounds(from_day, to_day)

    # 4. Resumen
    if "summary" in sections:
        story.append(_section_title("Resumen"))
        series = inv_repo.daily_sales_series(db, start, end)
        payments = inv_repo.payment_breakdown(db, start, end)
        total_sales = sum(s["total"] for s in series)
        total_orders = sum(s["orders"] for s in series)
        avg_ticket = total_sales / total_orders if total_orders else 0
        best_day = max(series, key=lambda s: s["total"])["date"] if series else None
        story.append(
            _zebra(
                [
                    ["Indicador", "Valor"],
                    ["Ventas totales", _fmt(total_sales)],
                    ["Órdenes pagadas", str(total_orders)],
                    ["Ticket promedio", _fmt(avg_ticket)],
                    ["Día más fuerte", _day_name(best_day)],
                    ["Efectivo", _fmt(payments["Efectivo"])],
                    ["Yape", _fmt(payments["Yape"])],
                ],
                widths=[9 * cm, 9 * cm],
            )
        )
        story.append(Spacer(1, 10))
        story.append(_sales_chart(db, start, end))

    # 5. Ventas (tabla por día)
    if "sales" in sections:
        story.append(_section_title("Ventas por día"))
        story.append(_zebra(_sales_rows(db, start, end), widths=[6 * cm, 6 * cm, 6 * cm]))

    # 6. Pagos
    if "payments" in sections:
        payments = inv_repo.payment_breakdown(db, start, end)
        total = payments["Efectivo"] + payments["Yape"]
        story.append(_section_title("Pagos"))
        if total > 0:
            rows = [
                ["Medio de pago", "Monto", "Porcentaje"],
                ["Efectivo", _fmt(payments["Efectivo"]), f"{payments['Efectivo'] / total * 100:.0f}%"],
                ["Yape", _fmt(payments["Yape"]), f"{payments['Yape'] / total * 100:.0f}%"],
            ]
        else:
            rows = [["Medio de pago", "Monto", "Porcentaje"], ["Efectivo", _fmt(0), "—"], ["Yape", _fmt(0), "—"]]
        story.append(_zebra(rows, widths=[6 * cm, 6 * cm, 6 * cm]))

    # 7. Productos
    if "products" in sections:
        story.append(_section_title("Productos más vendidos"))
        rows = [["#", "Producto", "Cantidad", "Importe"]]
        for index, item in enumerate(inv_repo.top_products(db, start, end, limit=10), start=1):
            rows.append([str(index), item["product_name"], str(item["quantity"]), _fmt(item["revenue"])])
        if len(rows) == 1:
            rows.append(["—", "Sin ventas en el periodo", "—", "—"])
        story.append(_zebra(rows, widths=[1.5 * cm, 9 * cm, 3.5 * cm, 4 * cm]))

    # 8. Stock / compras
    if "inventory" in sections:
        story.append(_section_title("Stock bajo"))
        rows = [["Insumo", "Categoría", "Stock actual", "Mínimo", "Estado"]]
        for ingredient in inv_repo.list_ingredients(db):
            current = Decimal(ingredient.current_stock)
            if current > Decimal(ingredient.min_stock_alert):
                continue
            rows.append(
                [
                    ingredient.name,
                    ingredient.category,
                    f"{current.normalize()} {ingredient.base_unit}",
                    f"{Decimal(ingredient.min_stock_alert).normalize()} {ingredient.base_unit}",
                    "BAJO",
                ]
            )
        if len(rows) == 1:
            rows.append(["—", "—", "—", "—", "Sin insumos bajo mínimo"])
        story.append(_zebra(rows, widths=[4 * cm, 3 * cm, 3.5 * cm, 3.5 * cm, 4 * cm]))

        story.append(_section_title("Recomendaciones pendientes"))
        rec_rows = [["Insumo", "Comprar", "Motivo"]]
        for rec in inv_repo.pending_recommendations(db, status="pendiente"):
            name = rec.ingredient.name if rec.ingredient else "—"
            rec_rows.append([name, f"{Decimal(rec.recommended_quantity).normalize()}", (rec.reason or "")[:140]])
        if len(rec_rows) == 1:
            rec_rows.append(["—", "—", "Sin recomendaciones pendientes"])
        story.append(_zebra(rec_rows, widths=[3.5 * cm, 2.5 * cm, 12 * cm]))

    # 9. Predicciones y anomalías
    if "forecasts" in sections:
        story.append(_section_title("Predicciones (próximos días)"))
        forecasts = list(
            db.scalars(select(DemandForecastModel).order_by(DemandForecastModel.forecast_date).limit(40))
        )
        rows = [["Fecha", "Producto", "Cantidad prevista", "Confianza"]]
        for forecast in forecasts:
            rows.append(
                [
                    forecast.forecast_date.strftime("%d/%m/%Y"),
                    forecast.product.name if forecast.product else "—",
                    f"{Decimal(forecast.predicted_quantity).normalize()}",
                    str(Decimal(forecast.confidence_score or 0).normalize()),
                ]
            )
        if len(rows) == 1:
            rows.append(["—", "—", "—", "Sin predicciones: registran al menos 4 semanas de ventas."])
        story.append(_zebra(rows, widths=[3 * cm, 6 * cm, 4 * cm, 5 * cm]))

    if "anomalies" in sections:
        story.append(_section_title("Anomalías"))
        anomalies = list(
            db.scalars(select(SalesAnomalyModel).order_by(SalesAnomalyModel.detected_date.desc()).limit(15))
        )
        rows = [["Fecha", "Tipo", "Esperado", "Real", "Estado"]]
        type_labels = {"caida_venta": "Caída de ventas", "pico_venta": "Pico de ventas"}
        for anomaly in anomalies:
            rows.append(
                [
                    anomaly.detected_date.strftime("%d/%m/%Y"),
                    type_labels.get(anomaly.anomaly_type or "", anomaly.anomaly_type or "—"),
                    _fmt(anomaly.expected_value),
                    _fmt(anomaly.actual_value),
                    "Revisada" if anomaly.is_reviewed else "Por revisar",
                ]
            )
        if len(rows) == 1:
            rows.append(["—", "—", "—", "—", "Sin anomalías registradas"])
        story.append(_zebra(rows, widths=[3 * cm, 4.5 * cm, 3.5 * cm, 3.5 * cm, 3.5 * cm]))

    # 10. Pie
    story.append(Spacer(1, 12))
    story.append(_paragraph("Datos generados por el sistema Tía Julia.", size=10))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def _day_name(day_iso: str | None) -> str:
    if not day_iso:
        return "—"
    return DAY_NAMES[date.fromisoformat(day_iso).weekday()]


def _sales_rows(db, start, end) -> list[list[str]]:
    rows = [["Fecha", "Ventas", "Órdenes"]]
    for item in inv_repo.daily_sales_series(db, start, end):
        rows.append([item["date"], _fmt(item["total"]), str(item["orders"])])
    if len(rows) == 1:
        rows.append(["—", "—", "Sin ventas en el periodo"])
    return rows


def _sales_chart(db, start, end):
    """Rasterize the daily sales series to a high-resolution bar chart image."""
    series = inv_repo.daily_sales_series(db, start, end)
    if not series:
        return _paragraph("Sin ventas en el periodo.")
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        labels = [s["date"][5:] for s in series]
        values = [s["total"] for s in series]
        fig, ax = plt.subplots(figsize=(7.6, 2.6), dpi=200)
        ax.bar(labels, values, color="#E99015")
        ax.set_ylabel("Ventas (S/)")
        ax.tick_params(axis="x", rotation=45, labelsize=9)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        tmp_path = settings.report_dir_path / "tmp_sales_chart.png"
        fig.tight_layout()
        fig.savefig(tmp_path)
        plt.close(fig)
        return Image(str(tmp_path), width=17 * cm, height=17 * cm * 2.6 / 7.6)
    except Exception:
        return _zebra(_sales_rows(db, start, end), widths=[6 * cm, 6 * cm, 6 * cm])
