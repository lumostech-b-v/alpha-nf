#!/usr/bin/env python3
"""
Simple test script to verify JWT authentication system
"""

import requests
import json
import sys

# Configuration
BASE_URL = "http://localhost:8000"
TEST_USER = {
    "username": "testuser",
    "email": "test@example.com",
    "password": "testpassword123",
    "first_name": "Test",
    "last_name": "User"
}

def test_authentication():
    """Test the complete authentication flow"""
    print("🧪 Testing JWT Authentication System")
    print("=" * 50)
    
    # Step 1: Create a test user
    print("📝 Step 1: Creating test user...")
    try:
        response = requests.post(f"{BASE_URL}/users/", json=TEST_USER)
        if response.status_code == 200:
            print("✅ Test user created successfully")
        elif response.status_code == 400 and "already exists" in response.text:
            print("ℹ️  Test user already exists (this is fine)")
        else:
            print(f"❌ Failed to create user: {response.status_code} - {response.text}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Make sure the server is running on localhost:8000")
        return False
    
    # Step 2: Login and get token
    print("\n📝 Step 2: Logging in...")
    login_data = {
        "username": TEST_USER["username"],
        "password": TEST_USER["password"]
    }
    
    try:
        response = requests.post(f"{BASE_URL}/users/login", json=login_data)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                token = data.get("token")
                user = data.get("user")
                print(f"✅ Login successful")
                print(f"   User ID: {user.get('id')}")
                print(f"   Username: {user.get('username')}")
                print(f"   Token: {token[:20]}...")
            else:
                print(f"❌ Login failed: {data.get('message')}")
                return False
        else:
            print(f"❌ Login request failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False
    
    # Step 3: Test token verification
    print("\n📝 Step 3: Verifying token...")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.post(f"{BASE_URL}/users/verify", headers=headers)
        if response.status_code == 200:
            data = response.json()
            if data.get("valid"):
                print("✅ Token verification successful")
                print(f"   Verified user: {data.get('user', {}).get('username')}")
            else:
                print("❌ Token verification failed")
                return False
        else:
            print(f"❌ Token verification request failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Token verification error: {e}")
        return False
    
    # Step 4: Test protected endpoint (protocols)
    print("\n📝 Step 4: Testing protected endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/protocols/", headers=headers)
        if response.status_code == 200:
            print("✅ Protected endpoint access successful")
            protocols = response.json()
            print(f"   Found {len(protocols)} protocols")
        else:
            print(f"❌ Protected endpoint access failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Protected endpoint error: {e}")
        return False
    
    # Step 5: Test invalid token
    print("\n📝 Step 5: Testing invalid token...")
    invalid_headers = {"Authorization": "Bearer invalid_token"}
    
    try:
        response = requests.post(f"{BASE_URL}/users/verify", headers=invalid_headers)
        if response.status_code in [401, 403]:
            print("✅ Invalid token correctly rejected")
        else:
            print(f"❌ Invalid token not rejected: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Invalid token test error: {e}")
        return False
    
    print("\n🎉 All authentication tests passed!")
    return True

def test_protocol_endpoints():
    """Test protocol endpoints with authentication"""
    print("\n🧪 Testing Protocol Endpoints")
    print("=" * 50)
    
    # First login to get token
    login_data = {
        "username": TEST_USER["username"],
        "password": TEST_USER["password"]
    }
    
    try:
        response = requests.post(f"{BASE_URL}/users/login", json=login_data)
        if response.status_code != 200 or not response.json().get("success"):
            print("❌ Cannot login to test protocol endpoints")
            return False
        
        token = response.json().get("token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test getting all protocols
        print("📝 Testing GET /protocols/...")
        response = requests.get(f"{BASE_URL}/protocols/", headers=headers)
        if response.status_code == 200:
            print("✅ GET /protocols/ successful")
        else:
            print(f"❌ GET /protocols/ failed: {response.status_code}")
            return False
        
        # Test getting protocols without token (should fail)
        print("📝 Testing GET /protocols/ without token...")
        response = requests.get(f"{BASE_URL}/protocols/")
        if response.status_code in [401, 403]:
            print("✅ Unauthorized access correctly rejected")
        else:
            print(f"❌ Unauthorized access not rejected: {response.status_code}")
            return False
        
        print("✅ Protocol endpoint tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Protocol endpoint test error: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Starting Authentication System Tests")
    print("Make sure the server is running: uvicorn app.core.main:app --reload")
    print()
    
    # Test authentication
    auth_success = test_authentication()
    
    if auth_success:
        # Test protocol endpoints
        protocol_success = test_protocol_endpoints()
        
        if protocol_success:
            print("\n🎉 All tests passed! Authentication system is working correctly.")
            sys.exit(0)
        else:
            print("\n❌ Protocol endpoint tests failed.")
            sys.exit(1)
    else:
        print("\n❌ Authentication tests failed.")
        sys.exit(1)
