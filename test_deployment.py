#!/usr/bin/env python3
"""
Comprehensive testing script for Nigzsu Dashboard deployment
Tests all critical functionality end-to-end
"""

import requests
import json
import time
import sys
from typing import Dict, Any, List
import base64

class NigzsuTestSuite:
    def __init__(self):
        self.base_url = "http://localhost:5000"
        self.api_url = f"{self.base_url}/api"
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = f"{status} - {test_name}"
        if details:
            result += f" | {details}"
        print(result)
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    def test_server_availability(self) -> bool:
        """Test if the React frontend server responds"""
        try:
            response = self.session.get(self.base_url, timeout=10)
            success = response.status_code == 200
            self.log_test("React Frontend Server", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("React Frontend Server", False, f"Error: {str(e)}")
            return False
            
    def test_authentication_endpoint(self) -> bool:
        """Test authentication API endpoint"""
        try:
            auth_data = {"username": "client1", "password": "client123"}
            response = self.session.post(f"{self.api_url}/login", json=auth_data, timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                try:
                    data = response.json()
                    details += f" | User: {data.get('user', {}).get('username', 'N/A')}"
                except:
                    details += " | Response not JSON"
            self.log_test("Authentication Endpoint", success, details)
            return success
        except Exception as e:
            self.log_test("Authentication Endpoint", False, f"Error: {str(e)}")
            return False
            
    def test_chart_data_endpoint(self) -> bool:
        """Test chart data API endpoint with authentication"""
        try:
            # Use basic auth for API access
            auth = base64.b64encode(b"client1:client123").decode('ascii')
            headers = {"Authorization": f"Basic {auth}"}
            
            response = self.session.get(f"{self.api_url}/chart-data", headers=headers, timeout=15)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    data = response.json()
                    # The API returns 'data' field, not 'raw_data'
                    record_count = len(data.get('data', []))
                    details += f" | Records: {record_count}"
                    
                    # Verify required response structure exists
                    required_keys = ['data', 'summary', 'intelligence']
                    missing_keys = [key for key in required_keys if key not in data]
                    if missing_keys:
                        details += f" | Missing: {missing_keys}"
                        success = False
                    else:
                        details += " | All response fields present"
                        
                        # Check intelligence data structure
                        intelligence = data.get('intelligence', {})
                        required_intel = ['total_records', 'latest_timestamp', 'peak_hours']
                        missing_intel = [key for key in required_intel if key not in intelligence]
                        if missing_intel:
                            details += f" | Missing intelligence: {missing_intel}"
                            success = False
                        
                except Exception as parse_e:
                    details += f" | Parse error: {str(parse_e)}"
                    success = False
                    
            self.log_test("Chart Data Endpoint", success, details)
            return success
        except Exception as e:
            self.log_test("Chart Data Endpoint", False, f"Error: {str(e)}")
            return False
            
    def test_csv_data_processing(self) -> bool:
        """Test CSV data processing functionality"""
        try:
            # Use basic auth
            auth = base64.b64encode(b"client1:client123").decode('ascii')
            headers = {"Authorization": f"Basic {auth}"}
            
            response = self.session.get(f"{self.api_url}/chart-data", headers=headers, timeout=15)
            if response.status_code != 200:
                self.log_test("CSV Data Processing", False, f"API call failed: {response.status_code}")
                return False
                
            data = response.json()
            # The API returns 'data' field, not 'raw_data'
            raw_data = data.get('data', [])
            
            # Verify data structure and content
            success = True
            details = []
            
            if len(raw_data) == 0:
                success = False
                details.append("No CSV data loaded")
            else:
                details.append(f"Loaded {len(raw_data)} records")
                
                # Also check the summary data
                summary = data.get('summary', {})
                if summary.get('total_records', 0) > 0:
                    details.append(f"Summary confirms {summary['total_records']} records")
                else:
                    success = False
                    details.append("Summary shows 0 records")
                
                # Check first record has expected fields
                if raw_data:
                    first_record = raw_data[0]
                    expected_fields = ['timestamp', 'age_estimate', 'sex', 'event']
                    missing_fields = [field for field in expected_fields if field not in first_record]
                    if missing_fields:
                        success = False
                        details.append(f"Missing fields: {missing_fields}")
                    else:
                        details.append("All required fields present")
                        
                        # Verify timestamp processing
                        timestamps = [r.get('timestamp') for r in raw_data[:5]]
                        if all(timestamps):
                            details.append("Timestamps processed correctly")
                        else:
                            success = False
                            details.append("Timestamp processing failed")
            
            self.log_test("CSV Data Processing", success, " | ".join(details))
            return success
        except Exception as e:
            self.log_test("CSV Data Processing", False, f"Error: {str(e)}")
            return False
            
    def test_data_filtering(self) -> bool:
        """Test data filtering functionality"""
        try:
            auth = base64.b64encode(b"client1:client123").decode('ascii')
            headers = {"Authorization": f"Basic {auth}"}
            
            # Test with date filter
            params = {"start_date": "2024-01-01", "end_date": "2024-12-31"}
            response = self.session.get(f"{self.api_url}/chart-data", headers=headers, params=params, timeout=15)
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            
            if success:
                data = response.json()
                # Fix: Use correct 'data' field instead of deprecated 'raw_data'
                filtered_count = len(data.get('data', []))
                details += f" | Filtered records: {filtered_count}"
                
            self.log_test("Data Filtering", success, details)
            return success
        except Exception as e:
            self.log_test("Data Filtering", False, f"Error: {str(e)}")
            return False
            
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all tests and return summary"""
        print("🔬 Starting Nigzsu Dashboard Comprehensive Testing")
        print("=" * 60)
        
        # Wait for server to be ready
        print("⏳ Waiting for servers to start...")
        time.sleep(3)
        
        # Run tests in order
        tests = [
            self.test_server_availability,
            self.test_authentication_endpoint,
            self.test_chart_data_endpoint,
            self.test_csv_data_processing,
            self.test_data_filtering
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                if test():
                    passed += 1
            except Exception as e:
                print(f"❌ Test failed with exception: {e}")
                
        print("\n" + "=" * 60)
        print(f"📊 TEST SUMMARY: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED! Deployment is working correctly.")
        else:
            print(f"⚠️  {total - passed} tests failed. Check the details above.")
            
        return {
            "total_tests": total,
            "passed_tests": passed,
            "success_rate": passed / total,
            "all_passed": passed == total,
            "results": self.test_results
        }

if __name__ == "__main__":
    tester = NigzsuTestSuite()
    summary = tester.run_all_tests()
    
    # Exit with error code if tests failed
    if not summary["all_passed"]:
        sys.exit(1)