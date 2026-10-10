"""Endpoints de reportes y exportación PDF (secciones 19, 27.8 y 34)."""

from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.application.dto import PDFRequest
from app.application.use_cases import reports_use_case
from app.core.config import settings
from app.core.database import get_db
from app.infrastructure.pdf.report_generator import generate_report_pdf

router = APIRouter()


@router.get("/reports/summary")
def report_summary(from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)):
    return reports_use_case.report_summary(db, from_date, to_date)


@router.get("/reports/sales")
def report_sales(from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)):
    return reports_use_case.report_sales(db, from_date, to_date)


@router.get("/reports/payments")
def report_payments(from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)):
    return reports_use_case.report_payments(db, from_date, to_date)


@router.get("/reports/products")
def report_products(from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)):
    return reports_use_case.report_products(db, from_date, to_date)


@router.get("/reports/inventory")
def report_inventory(from_date: date = Query(alias="from"), to_date: date = Query(alias="to"), db: Session = Depends(get_db)):
    return reports_use_case.report_inventory(db, from_date, to_date)


@router.post("/reports/pdf")
def export_pdf(data: PDFRequest, db: Session = Depends(get_db)):
    """Generate the PDF report. Returns application/pdf with a descriptive filename."""
    from pathlib import Path

    logo = Path(settings.report_dir_path) / "logo-tia-julia.png"
    pdf_bytes = generate_report_pdf(
        db,
        from_day=data.from_date,
        to_day=data.to_date,
        sections=data.sections,
        brand_asset_path=str(logo) if logo.exists() else None,
    )
    filename = f"reporte_tia_julia_{date.today().isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
