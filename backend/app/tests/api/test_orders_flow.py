"""Tests de integración API (sección 41.2)."""

from decimal import Decimal


class TestOrdersFlow:
    def test_crear_orden_recalcula_precio_backend(self, client, seed_catalog):
        """26.1: backend recalcula; el frontend nunca manda el total."""
        catalog = seed_catalog
        response = client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mostrador",
                "pay_now": False,
                "items": [
                    {
                        "product_id": catalog["product_id"],
                        "quantity": 2,
                        "option_ids": [
                            catalog["size_grande_id"],
                            catalog["papaya_option_id"],
                            catalog["agua_option_id"],
                        ],
                    }
                ],
            },
        )
        assert response.status_code == 201, response.text
        body = response.json()
        order = body["order"]
        # base 10 + Grande 2 = 12 × 2 = 24
        assert Decimal(order["total_amount"]) == Decimal("24.00")
        assert order["status"] == "en_preparacion"

    def test_crear_orden_mesa_requiere_mesa(self, client, seed_catalog):
        catalog = seed_catalog
        response = client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mesa",
                "pay_now": False,
                "items": [{"product_id": catalog["product_id"], "quantity": 1, "option_ids": []}],
            },
        )
        assert response.status_code == 422

    def test_pagar_requiere_metodo(self, client, seed_catalog):
        catalog = seed_catalog
        order = client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mostrador",
                "pay_now": False,
                "items": [{"product_id": catalog["product_id"], "quantity": 1, "option_ids": []}],
            },
        ).json()["order"]
        response = client.post(
            f"/api/v1/orders/{order['id']}/pay", json={"payment_method_id": catalog["yape_id"]}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "pagado"
        assert response.json()["payment_method_name"] == "Yape"

    def test_pagar_orden_ya_pagada_rechazada(self, client, seed_catalog):
        catalog = seed_catalog
        order = client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mostrador",
                "pay_now": True,
                "payment_method_id": catalog["cash_id"],
                "items": [{"product_id": catalog["product_id"], "quantity": 1, "option_ids": []}],
            },
        ).json()["order"]
        response = client.post(
            f"/api/v1/orders/{order['id']}/pay", json={"payment_method_id": catalog["cash_id"]}
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_ORDER_STATE"

    def test_cancelar_orden_no_cuenta_como_venta(self, client, seed_catalog):
        """26.4: cancelado no cuenta en reportes."""
        catalog = seed_catalog
        order = client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mostrador",
                "pay_now": False,
                "items": [{"product_id": catalog["product_id"], "quantity": 1, "option_ids": []}],
            },
        ).json()["order"]
        response = client.post(f"/api/v1/orders/{order['id']}/cancel")
        assert response.status_code == 200
        assert response.json()["status"] == "cancelado"
        # summary should not include cancelled
        summary = client.get("/api/v1/reports/summary?from=2026-01-01&to=2030-01-01").json()
        assert summary["sales_total"] == 0

    def test_descuento_inventario_por_receta(self, client, seed_catalog, db_session):
        """24.1 + 27.4 paso 7: registrar salida de inventario si existe receta."""
        from app.infrastructure.db.models import IngredientModel

        catalog = seed_catalog
        before = db_session.get(IngredientModel, catalog["papaya_ingredient_id"]).current_stock
        response = client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mostrador",
                "pay_now": False,
                "items": [
                    {
                        "product_id": catalog["product_id"],
                        "quantity": 2,
                        "option_ids": [catalog["size_grande_id"], catalog["papaya_option_id"], catalog["agua_option_id"]],
                    }
                ],
            },
        )
        assert response.status_code == 201
        db_session.expire_all()
        after = db_session.get(IngredientModel, catalog["papaya_ingredient_id"]).current_stock
        # 0.200 kg × 1.25 (Grande) × 2 = 0.5 kg
        assert Decimal(str(before)) - Decimal(str(after)) == Decimal("0.500")

    def test_idempotencia_offline_no_duplica(self, client, seed_catalog):
        """24.2: Idempotency-Key evita duplicados al resincronizar."""
        catalog = seed_catalog
        payload = {
            "user_id": catalog["user_id"],
            "order_type": "mostrador",
            "pay_now": True,
            "payment_method_id": catalog["cash_id"],
            "items": [{"product_id": catalog["product_id"], "quantity": 1, "option_ids": []}],
        }
        first = client.post(
            "/api/v1/orders", json=payload, headers={"Idempotency-Key": "abc-123"}
        )
        second = client.post(
            "/api/v1/orders", json=payload, headers={"Idempotency-Key": "abc-123"}
        )
        assert first.status_code == 201
        assert second.status_code == 201
        assert first.json()["order"]["id"] == second.json()["order"]["id"]
        assert second.json()["idempotent_replay"] is True

    def test_agregar_detalle_recalcula_total(self, client, seed_catalog):
        catalog = seed_catalog
        order = client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mostrador",
                "pay_now": False,
                "items": [{"product_id": catalog["product_id"], "quantity": 1, "option_ids": []}],
            },
        ).json()["order"]
        response = client.post(
            f"/api/v1/orders/{order['id']}/details",
            json={"product_id": catalog["product_id"], "quantity": 1, "option_ids": [catalog["size_grande_id"]]},
        )
        assert response.status_code == 201
        assert Decimal(response.json()["order"]["total_amount"]) == Decimal("22.00")

    def test_error_formato_consistente(self, client):
        """27: {"error": {"code", "message", "details"}}."""
        response = client.get("/api/v1/orders/99999")
        assert response.status_code == 404
        body = response.json()
        assert body["error"]["code"] == "ORDER_NOT_FOUND"
        assert body["error"]["message"]
        assert "details" in body["error"]


class TestInventoryEndpoints:
    def test_entrada_calcula_unit_cost(self, client, seed_catalog):
        catalog = seed_catalog
        response = client.post(
            "/api/v1/inventory/entries",
            json={"ingredient_id": catalog["papaya_ingredient_id"], "quantity": 5.5, "total_cost": 25.0},
        )
        assert response.status_code == 201
        body = response.json()
        assert abs(float(body["unit_cost"]) - 4.545) < 0.001
        assert body["movement_type"] == "entrada"

    def test_ingredients_exponen_ultimo_costo_de_compra(self, client, seed_catalog):
        """Sección 8: el último costo de compra alimenta la sugerencia de precio."""
        catalog = seed_catalog
        response = client.post(
            "/api/v1/inventory/entries",
            json={"ingredient_id": catalog["papaya_ingredient_id"], "quantity": 5.5, "total_cost": 25.0},
        )
        assert response.status_code == 201
        ingredients = client.get("/api/v1/ingredients").json()
        papaya = next(i for i in ingredients if i["id"] == catalog["papaya_ingredient_id"])
        assert abs(float(papaya["last_unit_cost"]) - 4.545) < 0.001
        # Un insumo sin compras registradas no tiene costo.
        agua = next(i for i in ingredients if i["id"] == catalog["agua_ingredient_id"])
        assert agua["last_unit_cost"] is None

    def test_entrada_aprende_peso_por_unidad(self, client, seed_catalog):
        """17.4: si llegan 2 kg en 10 piezas, el sistema guarda 0.2 kg por pieza."""
        catalog = seed_catalog
        response = client.post(
            "/api/v1/inventory/entries",
            json={
                "ingredient_id": catalog["papaya_ingredient_id"],
                "quantity": 2,
                "total_cost": 20.0,
                "unit_count": 10,
                "unit_name": "porción",
            },
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert abs(float(body["unit_weight"]) - 0.2) < 0.001
        assert body["unit_name"] == "porción"
        # El insumo queda con la unidad aprendida para contar sin pesar.
        ingredients = client.get("/api/v1/ingredients").json()
        saved = next(i for i in ingredients if i["id"] == catalog["papaya_ingredient_id"])
        assert abs(float(saved["unit_weight"]) - 0.2) < 0.001
        assert saved["unit_name"] == "porción"

    def test_ingredients_incluyen_comportamiento_e_incrementos(self, client, seed_catalog):
        """Sección 6: cada insumo expone su comportamiento y sus botones táctiles."""
        catalog = seed_catalog
        ingredients = client.get("/api/v1/ingredients").json()
        papaya = next(i for i in ingredients if i["id"] == catalog["papaya_ingredient_id"])
        agua = next(i for i in ingredients if i["id"] == catalog["agua_ingredient_id"])
        assert papaya["behavioral_type"] == "frutas_verduras"
        assert len(papaya["increments"]) == 4
        assert agua["behavioral_type"] == "liquidos"
        assert agua["increments"][0]["label"] == "+ 10 ml"

    def test_insumo_unidad_rechaza_decimales(self, client):
        """Sección 5.B: los insumos contables solo aceptan enteros."""
        created = client.post(
            "/api/v1/ingredients",
            json={
                "name": "Vaso",
                "category": "Otro",
                "base_unit": "unidad",
                "consumption_unit": "unidad",
                "behavioral_type": "unidades",
                "min_stock_alert": 10,
            },
        )
        assert created.status_code == 201, created.text
        ingredient_id = created.json()["id"]
        rejected = client.post(
            "/api/v1/inventory/entries",
            json={"ingredient_id": ingredient_id, "quantity": 2.5},
        )
        assert rejected.status_code == 422

    def test_ajuste_lleva_a_conteo_fisico(self, client, seed_catalog):
        catalog = seed_catalog
        response = client.post(
            "/api/v1/inventory/adjustments",
            json={"ingredient_id": catalog["papaya_ingredient_id"], "new_stock": 4.0, "reason": "Conteo físico"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["movement_type"] == "ajuste"
        assert float(body["new_stock"]) == 4.0

    def test_low_stock_lista(self, client, seed_catalog, db_session):
        from app.infrastructure.db.models import IngredientModel

        catalog = seed_catalog
        ingredient = db_session.get(IngredientModel, catalog["papaya_ingredient_id"])
        ingredient.current_stock = Decimal("2.000")  # <= 5 -> BAJO, <= 2.5 -> CRITICO
        db_session.flush()
        response = client.get("/api/v1/ingredients/low-stock")
        items = response.json()
        assert any(i["ingredient_id"] == catalog["papaya_ingredient_id"] for i in items)


class TestDashboard:
    def test_summary_shape(self, client, seed_catalog):
        catalog = seed_catalog
        client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mostrador",
                "pay_now": True,
                "payment_method_id": catalog["yape_id"],
                "items": [{"product_id": catalog["product_id"], "quantity": 1, "option_ids": []}],
            },
        )
        response = client.get("/api/v1/dashboard/summary?period=today")
        assert response.status_code == 200
        body = response.json()
        assert body["period"] == "today"
        assert Decimal(str(body["sales_total"])) == Decimal("10.00")
        assert body["orders_paid"] == 1
        assert "cash" in body["payments"] and "yape" in body["payments"]

    def test_sales_series_dias(self, client, seed_catalog):
        response = client.get("/api/v1/dashboard/sales-series?period=week")
        assert response.status_code == 200
        series = response.json()
        assert len(series) == 7


class TestReports:
    def test_pdf_export(self, client, seed_catalog):
        """34: POST /reports/pdf devuelve application/pdf."""
        response = client.post(
            "/api/v1/reports/pdf",
            json={"from_date": "2026-01-01", "to_date": "2030-01-01", "sections": ["summary", "payments"]},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content[:5] == b"%PDF-"

    def test_payments_breakdown(self, client, seed_catalog):
        catalog = seed_catalog
        client.post(
            "/api/v1/orders",
            json={
                "user_id": catalog["user_id"],
                "order_type": "mostrador",
                "pay_now": True,
                "payment_method_id": catalog["yape_id"],
                "items": [{"product_id": catalog["product_id"], "quantity": 1, "option_ids": []}],
            },
        )
        response = client.get("/api/v1/reports/payments?from=2026-01-01&to=2030-01-01")
        body = response.json()
        assert Decimal(str(body["yape"])) == Decimal("10.00")
        assert body["yape_pct"] == 100.0


class TestHealth:
    def test_health(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "ok"}
