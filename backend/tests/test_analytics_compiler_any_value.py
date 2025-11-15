import re

from backend.app.analytics.compiler import CompilerContext, SpecCompiler
from backend.app.analytics.dashboard_catalogue import get_dashboard_spec


def test_live_flow_sql_avoids_any_value_order_by():
    spec = get_dashboard_spec("dashboard.live_flow")
    compiler = SpecCompiler()
    compiled = compiler.compile(spec, CompilerContext(table_name="project.dataset.table"))

    assert "ANY_VALUE(" not in compiled.sql
    assert re.search(r"ARRAY_AGG\(clamped\.occupancy ORDER BY", compiled.sql)
