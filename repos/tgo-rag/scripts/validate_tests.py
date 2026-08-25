#!/usr/bin/env python3
"""
Test validation script to ensure all tests can be imported and basic functionality works.
"""

import sys
import importlib
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

def validate_test_imports():
    """Validate that all test modules can be imported."""
    test_modules = [
        "tests.test_vector_store_unit",
        "tests.test_embedding_service_unit", 
        "tests.test_search_service_unit",
        "tests.test_document_processing_unit",
        "tests.test_rag_workflow_integration",
        "tests.test_search_integration",
        "tests.test_health",
    ]
    
    print("Validating test module imports...")
    
    for module_name in test_modules:
        try:
            importlib.import_module(module_name)
            print(f"✓ {module_name}")
        except ImportError as e:
            print(f"✗ {module_name}: {e}")
            return False
    
    return True


def validate_service_imports():
    """Validate that all service modules can be imported."""
    service_modules = [
        "src.rag_service.services.embedding",
        "src.rag_service.services.vector_store",
        "src.rag_service.services.search",
        "src.rag_service.tasks.document_processing",
    ]
    
    print("\nValidating service module imports...")
    
    for module_name in service_modules:
        try:
            importlib.import_module(module_name)
            print(f"✓ {module_name}")
        except ImportError as e:
            print(f"✗ {module_name}: {e}")
            return False
    
    return True


def validate_test_structure():
    """Validate test file structure and basic requirements."""
    test_files = [
        "tests/test_vector_store_unit.py",
        "tests/test_embedding_service_unit.py",
        "tests/test_search_service_unit.py", 
        "tests/test_document_processing_unit.py",
        "tests/test_rag_workflow_integration.py",
    ]
    
    print("\nValidating test file structure...")
    
    for test_file in test_files:
        file_path = Path(test_file)
        if not file_path.exists():
            print(f"✗ {test_file}: File not found")
            return False
        
        # Check for basic test structure
        content = file_path.read_text()
        
        required_elements = [
            "import pytest",
            "@pytest.mark.asyncio",
            "class Test",
            "def test_",
        ]
        
        missing_elements = []
        for element in required_elements:
            if element not in content:
                missing_elements.append(element)
        
        if missing_elements:
            print(f"✗ {test_file}: Missing elements: {missing_elements}")
            return False
        
        print(f"✓ {test_file}")
    
    return True


def validate_fake_embedding():
    """Validate that the fake embedding implementation works correctly."""
    print("\nValidating fake embedding implementation...")
    
    try:
        # Import the fake embedding from test files
        sys.path.insert(0, str(Path("tests")))
        from test_vector_store_unit import FakeEmbedding
        
        fake_embedding = FakeEmbedding(size=1536)
        
        # Test single embedding
        embedding = fake_embedding.embed_query("test text")
        assert len(embedding) == 1536
        assert all(isinstance(x, float) for x in embedding)
        
        # Test batch embeddings
        embeddings = fake_embedding.embed_documents(["text 1", "text 2"])
        assert len(embeddings) == 2
        assert all(len(emb) == 1536 for emb in embeddings)
        
        # Test deterministic behavior
        embedding1 = fake_embedding.embed_query("same text")
        embedding2 = fake_embedding.embed_query("same text")
        assert embedding1 == embedding2
        
        print("✓ Fake embedding implementation")
        return True
        
    except Exception as e:
        print(f"✗ Fake embedding implementation: {e}")
        return False


def main():
    """Main validation function."""
    print("RAG Service Test Validation")
    print("=" * 40)
    
    validations = [
        validate_service_imports,
        validate_test_imports,
        validate_test_structure,
        validate_fake_embedding,
    ]
    
    all_passed = True
    
    for validation in validations:
        if not validation():
            all_passed = False
    
    print("\n" + "=" * 40)
    
    if all_passed:
        print("✓ All validations passed!")
        print("\nYou can now run tests with:")
        print("  make test-unit")
        print("  make test-integration") 
        print("  make test-all")
        return 0
    else:
        print("✗ Some validations failed!")
        print("\nPlease fix the issues above before running tests.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
