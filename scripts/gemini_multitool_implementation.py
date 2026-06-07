import os
from google import genai
from google.genai import types

# 1. Define the internal tool (Python function)
# The SDK uses introspection on the type hints and docstring to build the schema.
def get_internal_inventory(product_id: str) -> str:
    """
    Checks the internal inventory system for a given product ID.
    
    Args:
        product_id: The unique identifier for the product (e.g., 'QX-PRO-99').
        
    Returns:
        A string indicating the current stock status and location.
    """
    # Mock database lookup for demonstration purposes
    inventory_db = {
        "QX-PRO-99": "In stock: 45 units available in Warehouse A.",
        "QX-LITE-10": "Out of stock. Restock expected in 2 weeks."
    }
    return inventory_db.get(product_id, f"Product ID '{product_id}' not found in inventory.")

def main():
    # Initialize the client. Assumes GEMINI_API_KEY is set in the environment.
    client = genai.Client()

    # 2. Configure the generation request with BOTH tools
    google_search_tool = types.Tool(
        google_search=types.GoogleSearch()
    )

    config = types.GenerateContentConfig(
        tools=[google_search_tool, get_internal_inventory],
        temperature=0.0,
        # Enable automatic function calling to let the SDK handle the execution loop
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=False) 
    )

    # 3. Execute the multi-tool generation request
    # The model will autonomously route to Google Search for public data 
    # and execute the local Python function for internal data.
    prompt = (
        "What are the latest reviews and public sentiment for the 'QuantumX Pro' "
        "from the web, and do we currently have product_id 'QX-PRO-99' in stock?"
    )

    print("Sending multi-tool request to Gemini...\n")
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=prompt,
        config=config
    )

    # 4. Output the synthesized, grounded response
    print("Synthesized Response:\n", response.text)

    # 5. Extract execution metadata (Citations & Tool Usage)
    metadata = response.candidates[0].grounding_metadata
    
    if metadata and hasattr(metadata, "web_search_queries"):
        print("\n[System] Web Search Queries Executed:")
        for query in metadata.web_search_queries:
            print(f" -> {query}")

    if metadata and hasattr(metadata, "grounding_chunks"):
        print("\n[System] External Sources Cited:")
        for chunk in metadata.grounding_chunks:
            if hasattr(chunk, "web") and chunk.web:
                print(f" -> {chunk.web.title}: {chunk.web.uri}")

if __name__ == "__main__":
    # Ensure API key is present before running
    if not os.environ.get("GEMINI_API_KEY"):
        print("Error: GEMINI_API_KEY environment variable not set.")
    else:
        main()
