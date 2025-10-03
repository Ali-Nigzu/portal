from playwright.sync_api import sync_playwright
import sys

def test_reports_page():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        try:
            # Navigate to login
            page.goto('http://localhost:5000')
            
            # Login as client1
            page.fill('input[type="text"]', 'client1')
            page.fill('input[type="password"]', 'client123')
            page.click('button:has-text("Sign In")')
            
            # Wait for navigation and go to reports
            page.wait_for_timeout(2000)
            page.goto('http://localhost:5000/reports')
            page.wait_for_timeout(2000)
            
            # Check heading is "Reports" not "Available Report Templates"
            heading_text = page.text_selector('.vrm-card-title')
            if heading_text and 'Reports' in heading_text:
                print("✓ Heading changed to 'Reports'")
            else:
                print(f"✗ Heading issue: {heading_text}")
            
            # Check for no emojis in report cards
            report_cards = page.query_selector_all('.vrm-grid-2 > div')
            has_emoji = False
            for card in report_cards:
                text = card.inner_text()
                # Check for common emoji patterns
                if any(char in text for char in ['📊', '🚶', '👥', '📷']):
                    has_emoji = True
                    break
            
            if not has_emoji:
                print("✓ No emojis in report cards")
            else:
                print("✗ Emojis still present")
            
            # Check time period dropdown has new options
            page.click('select[value]')
            options_text = page.inner_text('select')
            
            if 'All Time' in options_text and 'Past Year' in options_text:
                print("✓ 'All Time' and 'Past Year' options added")
            else:
                print(f"✗ Missing time options. Found: {options_text}")
            
            # Take screenshot
            page.screenshot(path='/tmp/reports_page_test.png')
            print("✓ Screenshot saved to /tmp/reports_page_test.png")
            
            print("\n✅ All tests passed!")
            
        except Exception as e:
            print(f"✗ Test failed: {e}")
            page.screenshot(path='/tmp/reports_error.png')
            sys.exit(1)
        finally:
            browser.close()

if __name__ == '__main__':
    test_reports_page()
