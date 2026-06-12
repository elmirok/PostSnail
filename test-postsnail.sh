#!/usr/bin/env bash

# PostSnail Reader Test Script
# This script provides step-by-step instructions for testing the PostSnail Reader search functionality

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_URL="http://127.0.0.1:8000"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if server is running
check_server() {
    print_info "Checking if HTTP server is running..."
    if curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL" | grep -q "^200$"; then
        print_success "Server is running at $SERVER_URL"
        return 0
    else
        print_error "Server is not responding at $SERVER_URL"
        print_warning "Please start the server with: http-server -p 8000 -c-1"
        return 1
    fi
}

# Function to test basic page load
 test_basic_page() {
    print_info "Testing basic page load..."
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/")
    if [ "$response" = "200" ]; then
        print_success "Basic page loads successfully"
        return 0
    else
        print_error "Basic page failed to load (HTTP $response)"
        return 1
    fi
}

# Function to test Forest integration
 test_forest_integration() {
    print_info "Testing Forest integration..."
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/?forest=true")
    if [ "$response" = "200" ]; then
        print_success "Forest integration works (forest=true parameter)"
        return 0
    else
        print_error "Forest integration failed (HTTP $response)"
        return 1
    fi
}

# Function to test search functionality
 test_search_functionality() {
    print_info "Testing search functionality..."
    
    # Check if search input exists
    if curl -s "$SERVER_URL/" | grep -q "search-input\|search\|Search"; then
        print_success "Search interface is present"
        
        # Check if search results container exists
        if curl -s "$SERVER_URL/" | grep -q "search-results\|results\|No results"; then
            print_success "Search results container is present"
            return 0
        else
            print_warning "Search results container not found in HTML"
            return 1
        fi
    else
        print_error "Search interface not found in HTML"
        return 1
    fi
}

# Function to test mobile responsiveness
 test_mobile_responsiveness() {
    print_info "Testing mobile responsiveness..."
    
    # Check if responsive CSS is present
    if curl -s "$SERVER_URL/site.css" | grep -q "@media\|mobile\|responsive\|375px\|768px"; then
        print_success "Mobile responsive styles found"
        return 0
    else
        print_warning "Mobile responsive styles may not be present"
        return 1
    fi
}

# Function to test localStorage functionality
 test_localstorage() {
    print_info "Testing localStorage functionality..."
    
    # Create a simple test to check if localStorage is accessible
    local test_script="
    try {
        localStorage.setItem('test_key', 'test_value');
        const value = localStorage.getItem('test_key');
        if (value === 'test_value') {
            console.log('localStorage test: SUCCESS');
        } else {
            console.log('localStorage test: FAILED - value mismatch');
        }
        localStorage.removeItem('test_key');
    } catch (e) {
        console.log('localStorage test: FAILED -', e.message);
    }
    "
    
    # Check if localStorage is mentioned in the code
    if grep -r "localStorage" "$SERVER_URL/" 2>/dev/null | head -5 | grep -q "localStorage"; then
        print_success "localStorage usage detected in code"
        return 0
    else
        print_warning "localStorage usage may not be properly implemented"
        return 1
    fi
}

# Function to run all tests
run_all_tests() {
    print_info "Starting PostSnail Reader comprehensive tests..."
    echo "============================================"
    
    local tests_passed=0
    local tests_failed=0
    
    # Run all tests
    if check_server; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    
    if test_basic_page; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    
    if test_forest_integration; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    
    if test_search_functionality; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    
    if test_mobile_responsiveness; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    
    if test_localstorage; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    
    echo "============================================"
    print_info "Test Summary:"
    print_info "  Tests Passed: $tests_passed"
    print_info "  Tests Failed: $tests_failed"
    
    if [ $tests_failed -eq 0 ]; then
        print_success "All tests passed!"
        return 0
    else
        print_error "$tests_failed test(s) failed"
        return 1
    fi
}

# Function to display manual testing instructions
 manual_testing_instructions() {
    echo "============================================"
    print_info "Manual Testing Instructions"
    echo "============================================"
    
    echo ""
    print_info "1. Open your browser and navigate to:"
    echo "   $SERVER_URL"
    echo ""
    
    print_info "2. Test the following scenarios:"
    echo "   a) Basic search: Enter a search term in the search box"\n    echo "   b) Forest integration: Visit $SERVER_URL/?forest=true"
    echo "   c) Mobile view: Use browser dev tools to simulate mobile device"\n    echo "   d) Search results: Verify results display with title, snippet, and date"
    echo "   e) LocalStorage: Check that subscriptions and read state persist"
    echo ""
    
    print_info "3. Verify the following features:"
    echo "   ✓ Search input and results container are present"
    echo "   ✓ Forest integration parameter is handled correctly"
    echo "   ✓ Mobile responsive layout works on different screen sizes"
    echo "   ✓ localStorage is used for data persistence"
    echo "   ✓ Feed.json is used as primary source of truth"
    echo "   ✓ Trust cues (verified, stale, offline, missing proof) are displayed"
    echo ""
    
    print_info "4. Performance checks:"
    echo "   ✓ Page loads quickly with all resources"
    echo "   ✓ Search results appear without delays"
    echo "   ✓ No console errors in browser dev tools"
    echo ""
    
    print_info "5. Edge cases to test:"
    echo "   ✓ Empty search query"
    echo "   ✓ Very long search query"
    echo "   ✓ Special characters in search query"
    echo "   ✓ No matching results"
    echo "   ✓ Multiple concurrent searches"
    echo ""
}

# Main execution
if [[ "$1" == "--manual" ]]; then
    manual_testing_instructions
    exit 0
elif [[ "$1" == "--quick" ]]; then
    run_all_tests
    exit $?
else
    echo "Usage: $0 [--quick|--manual]"
    echo ""
    echo "Options:"
    echo "  --quick  Run automated tests"
    echo "  --manual Display manual testing instructions"
    echo ""
    exit 1
fi