# server.py
import subprocess
import sys
import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

# --- Configuration ---
# Get the absolute path of the directory where the server script is located
# This ensures that file paths are correct regardless of where the script is called from
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Flask App Initialization ---
app = Flask(__name__, static_folder=SERVER_DIR, static_url_path='')
CORS(app) # Enable Cross-Origin Resource Sharing for all routes

@app.route('/')
def serve_index():
    """
    Serves the main HTML file of the CRR viewer application.
    """
    return send_from_directory(SERVER_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static_files(path):
    """
    Serves static files like CSS and JavaScript.
    This is necessary for the HTML page to load its assets correctly.
    """
    return send_from_directory(SERVER_DIR, path)

@app.route('/run-pipeline', methods=['POST'])
def run_pipeline_endpoint():
    """
    An API endpoint that, when called, executes the consolidated data pipeline script.
    It captures and returns the output or errors from the script.
    """
    print("--- Received request to run the data pipeline ---")
    
    pipeline_script_path = os.path.join(SERVER_DIR, 'generate_crr_report.py')

    # Check if the pipeline script exists before trying to run it
    if not os.path.exists(pipeline_script_path):
        print(f"--- ERROR: Pipeline script not found at {pipeline_script_path} ---")
        return jsonify({
            "message": "Pipeline script not found on the server.",
            "error_details": f"No such file or directory: {pipeline_script_path}"
        }), 500

    try:
        # We use sys.executable to ensure the script runs with the same Python interpreter
        # that is running the Flask server. This avoids issues with virtual environments.
        process = subprocess.run(
            [sys.executable, pipeline_script_path],
            capture_output=True,
            text=True,
            check=True, # This will raise a CalledProcessError if the script returns a non-zero exit code
            cwd=SERVER_DIR # Run the script from its own directory
        )
        
        print("--- Pipeline executed successfully ---")
        print("Output:", process.stdout)
        
        return jsonify({
            "message": "Data pipeline completed successfully!",
            "output": process.stdout
        }), 200

    except subprocess.CalledProcessError as e:
        # This block catches errors from the script itself (e.g., a Python exception)
        print(f"--- ERROR: The pipeline script failed with exit code {e.returncode} ---")
        print("Stdout:", e.stdout)
        print("Stderr:", e.stderr)
        
        return jsonify({
            "message": "The data pipeline script encountered an error.",
            "error_details": e.stderr,
            "output": e.stdout
        }), 500
        
    except Exception as e:
        # This block catches other errors, such as problems starting the subprocess
        print(f"--- ERROR: An unexpected error occurred while trying to run the pipeline ---")
        print("Error:", str(e))

        return jsonify({
            "message": "An unexpected server error occurred.",
            "error_details": str(e)
        }), 500

if __name__ == '__main__':
    """
    Starts the Flask web server.
    It will be accessible at http://127.0.0.1:5000.
    """
    print("===================================================")
    print("=== Starting CRR Report Viewer Server ===")
    print("=== Access the application at: http://127.0.0.1:5000 ===")
    print("===================================================")
    app.run(debug=True)
