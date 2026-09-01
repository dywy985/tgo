import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "app" / "services" / "public_ticket_form.py"
SPEC = importlib.util.spec_from_file_location("public_ticket_form", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
render_public_ticket_form = MODULE.render_public_ticket_form


class PublicTicketFormTests(unittest.TestCase):
    def test_form_contains_required_fields_and_image_upload(self):
        html = render_public_ticket_form("signed-token")

        self.assertIn('name="contact_name"', html)
        self.assertIn('name="contact_phone"', html)
        self.assertIn('name="title"', html)
        self.assertIn('name="description"', html)
        self.assertIn('name="images"', html)
        self.assertIn('accept="image/jpeg,image/png,image/webp,image/gif"', html)
        self.assertIn('action="/api/v1/public-tickets/signed-token"', html)

    def test_token_is_html_escaped(self):
        html = render_public_ticket_form('bad"><script>alert(1)</script>')

        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)


if __name__ == "__main__":
    unittest.main()
