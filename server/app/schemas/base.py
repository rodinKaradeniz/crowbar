from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_serializer


class AppBaseModel(BaseModel):
    """Shared base for every Pydantic schema in the app.

    Two responsibilities, applied once here instead of per-schema:

    1. ``from_attributes=True`` so ORM rows serialize directly (replaces the
       ``model_config = {"from_attributes": True}`` that used to be repeated on
       every response schema).

    2. **Global money/Decimal serialization.** Pydantic v2 serializes a
       ``Decimal`` field to a JSON *string* by default (e.g. ``"12.50"``). The
       frontend TypeScript types declare these fields as ``number``, so a bare
       string on the wire silently breaks any ``.toFixed()`` / arithmetic on the
       value (this is the root cause of the earlier ``toFixed`` crash on order
       totals). Rather than annotate every individual ``Decimal`` field, this
       base rewrites *all* ``Decimal`` field values to ``float`` during JSON
       serialization for every schema that inherits it — so the fix is
       project-wide and any future ``Decimal`` field is covered automatically.

       The conversion runs only in JSON mode; ``model_dump()`` (python mode)
       keeps ``Decimal`` intact for any internal/service use.
    """

    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode="wrap")
    def _serialize_money(self, handler, info):
        data = handler(self)
        # In JSON mode the handler has already stringified Decimals; find them by
        # inspecting this model's own field values and overwrite with floats.
        # Nested models / list items run their own serializer, so only this
        # model's direct fields need handling here.
        if info.mode == "json" and isinstance(data, dict):
            for field_name, field in type(self).model_fields.items():
                value = getattr(self, field_name, None)
                if not isinstance(value, Decimal):
                    continue
                key = field.serialization_alias or field.alias or field_name
                if key in data:
                    data[key] = float(value)
        return data
