# Project Documentation: CRR Article Mapping and Reporting

## 1. Overview

This project is a data pipeline and web-based reporting tool designed to analyze and visualize the coverage of the Capital Requirements Regulation (CRR). It identifies references to CRR articles within various sources, including SAS code, text documents, and Jira tickets, and presents this information in a user-friendly web interface.

The primary goal is to provide a consolidated view of which CRR articles are addressed in the organization's projects, helping with compliance tracking, impact analysis, and project management.

## 2. Core Components

The project consists of two main parts: a Python-based data pipeline that gathers and processes the data, and a web application for viewing and interacting with the results.

### 2.1. Data Pipeline (`generate_crr_report.py`)

This Python script is the engine of the project. It performs the following steps:

1.  **Jira Integration**: Connects to a Jira instance using a provided API token to fetch issues (Defects and Requirements) based on predefined JQL queries. It extracts CRR article references from the summary, description, and comments of these issues.
2.  **File System Scanning**: Scans specified local directories for `.sas` and `.txt` files. It uses a set of regular expressions to find mentions of CRR articles within these files.
3.  **Data Aggregation**: Reads a master Table of Contents file (`toc_with_content.xlsx`), which contains the full list of CRR articles and their descriptions.
4.  **Report Generation**: Merges the data from Jira, the file system scan, and the master ToC into a single, comprehensive Excel file named `CRR_Full_Combined_Report.xlsx`. This report links CRR articles to the exact locations where they are referenced.

**Key Dependencies**: `pandas`, `openpyxl`, `jira`

### 2.2. Web Server (`server.py`)

A lightweight Flask web server that provides the backend for the web application. Its responsibilities are:

1.  **Serving Static Files**: Serves the main `index.html` page, as well as the accompanying `script.js` and `style.css` files.
2.  **API Endpoint**: Exposes a `POST` endpoint at `/run-pipeline`. When this endpoint is called, it executes the `generate_crr_report.py` script on the server, allowing the user to refresh the data on demand from the web interface.

**Key Dependencies**: `Flask`, `Flask-CORS`

### 2.3. Web Application (Frontend)

The frontend is built with standard HTML, CSS, and JavaScript.

#### `index.html`

This is the main HTML file that structures the web application. It includes:
- An upload button for the `CRR_Full_Combined_Report.xlsx` file.
- A "Refresh Data" button to trigger the pipeline via the server.
- A comprehensive set of filters (hierarchical and text-based) to narrow down the data.
- A main table to display the filtered results.
- Buttons for exporting the data to PDF or Excel and for showing visualizations.
- A modal for displaying a dashboard of charts.

#### `script.js`

This file contains all the client-side logic and interactivity:
- **File Handling**: Reads the uploaded Excel file using the `xlsx` library.
- **Filtering**: Implements the logic for all filters, updating the table in real-time.
- **API Communication**: Sends a request to the `/run-pipeline` endpoint on the server when the "Refresh Data" button is clicked.
- **Data Display**: Dynamically generates the HTML table from the loaded data, creating links to Jira and GitLab where applicable.
- **Dashboard & Charts**: Uses `Chart.js` to create and update a dashboard with several charts, including:
    - Article Support Status (Supported, Not Supported, Out of Scope).
    - Top 5 Referenced SAS Files.
    - Issue Coverage (articles with/without associated Jira tickets).
- **Exporting**: Uses `jsPDF` and `jsPDF-autotable` to generate PDF exports and `xlsx` to generate Excel exports of the filtered data.

#### `style.css`

This file contains all the styling rules for the web application, providing a clean, modern, and responsive user interface.

## 3. Workflow

1.  **Run the Server**: Start the Flask server by running `python server.py`. This will make the web application accessible at `http://127.0.0.1:5000`.
2.  **Generate Data (Initial)**: The first time, or whenever a full data refresh is needed, the user can click the "Refresh Data (Run Pipeline)" button in the web UI. This triggers the `generate_crr_report.py` script on the server, which can take a few minutes to complete.
3.  **Upload Report**: Once the pipeline has finished, it produces the `CRR_Full_Combined_Report.xlsx` file. The user then uploads this file using the "Upload Excel File" button.
4.  **Analyze Data**: With the data loaded, the user can:
    - Filter the data using the various dropdowns and search boxes.
    - View the results in the main table.
    - Click on links to go directly to the relevant Jira ticket or the specific line in a file on GitLab.
    - Open the dashboard to see a high-level overview of the data.
    - Export the currently filtered view to PDF or Excel for sharing or further analysis.

## 4. Source Files

-   **`CELEX_02013R0575-20250101_EN_TXT.html`**: The full HTML text of the CRR regulation, likely used as a primary reference for creating the `toc_with_content.xlsx` file.
-   **`toc_with_content.xlsx`**: The master file containing the CRR Table of Contents. This is a crucial input for the data pipeline.
-   **`CRR_Full_Combined_Report.xlsx`**: The final output of the data pipeline and the primary input for the web application.
-   **`requirements.txt`**: A file listing the Python dependencies for the project.
