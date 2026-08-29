"""add ticket form config and custom fields (工单表单配置化)

Revision ID: 0029_ticket_form_config
Revises: 0028_create_tickets
Create Date: 2026-08-28

新增：
- api_tickets.custom_fields JSONB（自定义字段值）
- api_ticket_settings.form_schema JSONB（表单模板：字段定义/必填/可编辑/自动填写规则）
- api_ticket_settings.sla_by_priority JSONB（分级 SLA 时限，按优先级）
- api_ticket_settings.number_format JSONB（工单号格式：前缀/日期/序号位数）
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0029_ticket_form_config"
down_revision: Union[str, None] = "0028_create_tickets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 工单自定义字段值
    op.add_column(
        "api_tickets",
        sa.Column(
            "custom_fields",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="自定义字段值 {field_key: value}，字段定义见 api_ticket_settings.form_schema",
        ),
    )

    # 工单设置：表单模板 / 分级SLA / 工单号格式
    op.add_column(
        "api_ticket_settings",
        sa.Column(
            "form_schema",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="工单表单模板：[{key,label,type,required,editable,options,placeholder,auto_fill}]",
        ),
    )
    op.add_column(
        "api_ticket_settings",
        sa.Column(
            "sla_by_priority",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="分级SLA时限(分钟)：{low,normal,high,urgent}，缺省回退 sla_timeout_minutes",
        ),
    )
    op.add_column(
        "api_ticket_settings",
        sa.Column(
            "number_format",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="工单号格式：{prefix:'TK-', date:true, seq_digits:4}",
        ),
    )


def downgrade() -> None:
    op.drop_column("api_ticket_settings", "number_format")
    op.drop_column("api_ticket_settings", "sla_by_priority")
    op.drop_column("api_ticket_settings", "form_schema")
    op.drop_column("api_tickets", "custom_fields")
