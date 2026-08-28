"""add scope_degrade_to_same_group and staff wecom_userid

Revision ID: 0030_assignment_routing
Revises: 0029_ticket_form_config
Create Date: 2026-08-28

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0030_assignment_routing"
down_revision: Union[str, None] = "0029_ticket_form_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 转人工路由：同群降级开关（默认开启）
    op.add_column(
        "api_ticket_settings",
        sa.Column(
            "scope_degrade_to_same_group",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="转人工路由客服不可服务时，是否降级给同群其他路由客服",
        ),
    )
    # 客服企微 userid（应用消息推送目标）
    op.add_column(
        "api_staff",
        sa.Column(
            "wecom_userid",
            sa.String(128),
            nullable=True,
            comment="企微成员 userid（应用消息推送目标）",
        ),
    )


def downgrade() -> None:
    op.drop_column("api_staff", "wecom_userid")
    op.drop_column("api_ticket_settings", "scope_degrade_to_same_group")
