# generate_crr_report.py
import os
import re
import sys
import pandas as pd
from collections import defaultdict
from jira import JIRA

# --- Configuration ---
# Get the absolute path of the directory where the script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Input Files ---
TOC_FILE = os.path.join(SCRIPT_DIR, "toc_with_content.xlsx")
TOKEN_FILE_PATH = r"C:\Users\sinjav\Password.txt" # IMPORTANT: Hardcoded path

# --- Source Code Directories ---
SAS_SEARCH_DIRECTORY = r"C:\Users\sinjav\Documents\fa_rrm\irm\source\sas"
TXT_SEARCH_DIRECTORY = r"C:\Users\sinjav\Documents\fa_rrm\irm\source\doc\pages"

# --- Output File ---
OUTPUT_EXCEL_FILE = os.path.join(SCRIPT_DIR, "CRR_Full_Combined_Report.xlsx")

# --- Jira Configuration ---
JIRA_SERVER = 'https://rndjira.sas.com'
JQL_DEFECTS = "project in (RRMCR) and issuetype in (Bug) and status not in (closed,'Accepted & Closed','Accepted and Close(Q)')"
JQL_REQTS = "project = PMRRM and issuetype in ('Feature Request', Requirement) and statusCategory != Done"

# --- Regular Expression Patterns for CRR Articles ---
# This single set of patterns will be used across all extraction functions
PATTERNS = {
    # Example: CRR article 123, CRR article 123.4, CRR article 123(4)
    'p1': r'CRR\s+article\s+(\d+(?:\.\d+)?(?:\(\d+\))?)',
    # Example: CRR articles 123, 456 and 789
    'p2': r'CRR\s+articles?\s+([\d\.\s,and]+(?:\d|\.))',
    # Example: CRR Art. 123, CRR Art. 123(a)
    'p3': r'CRR\s+Art\.\s+(\d+(?:\.\d+)*(?:\(\d+\))?)',
    # Example: Article 495a, CRR Article 125b
    'p4': r'(?:CRR\s+)?Article\s+(\d+[a-z]?(?:\(\d+\))?)',
    # Example: Art. 47a-2, Art. 123-a
    'p6': r'\bArt\.\s*(\d+[a-z]?\s*-\s*(?:\b\d+\b|\b[a-z]\b))\b',
    # Example: Art. 112 CRR, Art. 112(4) CRR
    'p7': r'\bArt\.\s*(\d+(?:\.\d+)?(?:[a-z])?(?:\(\d+\))?)\s*CRR'
}

# =====================================================================================
# --- HELPER FUNCTIONS ---
# =====================================================================================

def _log(message, level="INFO"):
    """Simple logging function."""
    print(f"[{level}] {message}")

def _split_article_list(list_string):
    """Helper function to split article lists found by pattern2."""
    list_string = re.sub(r'\s+and\s+', ',', list_string, flags=re.IGNORECASE)
    articles = [item.strip() for item in list_string.split(',') if item.strip()]
    cleaned_articles = set()
    num_pattern = re.compile(r'^\d+(?:\.\d+)?[a-z]?(?:\(\d+\))?(?:\s*-\s*(?:\b\d+\b|\b[a-z]\b))?$', re.IGNORECASE)
    for art in articles:
        match = num_pattern.match(art)
        if match:
            cleaned_articles.add(art)
        else:
            simple_num_match = re.match(r'^\d+(?:\.\d+)?[a-z]?(?:\(\d+\))?', art)
            if simple_num_match:
                cleaned_articles.add(simple_num_match.group(0))
    return list(cleaned_articles)

def _format_article_point(raw_article):
    """Formats raw article strings like '255-6' or '281.3' into '255(6)' and '281(3)'."""
    s = str(raw_article).strip()
    if re.match(r'^\d+(?:\.\d+)?[a-zA-Z]?\(\d+\)$', s):
        return s
    match = re.match(r'^(\d+[a-z]?)\s*-\s*(\d+|[a-z])$', s, re.IGNORECASE)
    if match:
        return f"{match.group(1)}({match.group(2)})"
    match = re.match(r'^(\d+)\.(\d+)$', s)
    if match:
        return f"{match.group(1)}({match.group(2)})"
    return s

# =====================================================================================
# --- DATA FETCHING AND EXTRACTION ---
# =====================================================================================

def fetch_jira_data(jira_conn, jql, issue_type):
    """Fetches data from Jira for a given JQL query."""
    _log(f"Fetching {issue_type} from Jira...")
    try:
        issues = jira_conn.search_issues(jql, maxResults=False, fields="summary,description,comment")
        _log(f"Found {len(issues)} {issue_type}.")
        issue_data = []
        for issue in issues:
            comments_text = ""
            if issue.fields.comment and issue.fields.comment.comments:
                for comment in issue.fields.comment.comments:
                    comments_text += f"Author: {comment.author.displayName}\nCreated: {comment.created}\nComment: {comment.body}\n---\n"
            
            issue_data.append({
                'Issue_key': issue.key,
                'Summary': issue.fields.summary,
                'Description': issue.fields.description,
                'Comments': comments_text
            })
        return pd.DataFrame(issue_data)
    except Exception as e:
        _log(f"Failed to fetch {issue_type}. Error: {e}", level="ERROR")
        return pd.DataFrame()

def extract_from_jira_df(df, issue_type):
    """Extracts CRR article references from a DataFrame of Jira issues."""
    _log(f"Extracting CRR references from {issue_type} data...")
    results = []
    text_columns = ['Summary', 'Description', 'Comments']
    
    for _, row in df.iterrows():
        search_text = " ".join([str(row.get(col, '')) for col in text_columns])
        found_articles_raw = set()

        for name, pattern in PATTERNS.items():
            matches = re.findall(pattern, search_text, re.IGNORECASE)
            if not matches:
                continue
            
            if name == 'p2':
                for match_list in matches:
                    articles = _split_article_list(match_list[0] if isinstance(match_list, tuple) else match_list)
                    found_articles_raw.update(articles)
            else:
                processed = [m[0] if isinstance(m, tuple) else m for m in matches if (m[0] if isinstance(m, tuple) else m)]
                found_articles_raw.update(processed)

        for raw_article in sorted(list(found_articles_raw)):
            if not raw_article: continue
            main_article_match = re.match(r'(\d+[a-zA-Z]*)', str(raw_article))
            main_article = main_article_match.group(1) if main_article_match else raw_article
            
            results.append({
                'Article': main_article,
                'Issue_Info': f"{row['Issue_key']}: {row['Summary']}"
            })
            
    _log(f"Extraction from {issue_type} complete.")
    return pd.DataFrame(results)

def find_references_in_files(search_dir, file_extension):
    """Finds CRR references in files with a given extension (.sas or .txt)."""
    _log(f"Scanning for {file_extension} files in {search_dir}...")
    # Structure: {article: {file_path: {'lines': set(), 'line_texts': {line_num: text}, 'section': '', 'subsection': ''}}}
    aggregated_results = defaultdict(lambda: defaultdict(lambda: {'lines': set(), 'line_texts': {}}))

    section_pattern = re.compile(r'\\section\s+\S+\s+(.*)', re.IGNORECASE)
    subsection_pattern = re.compile(r'\\subsection\s+\S+\s+(.*)', re.IGNORECASE)

    for root, _, files in os.walk(search_dir):
        for file in files:
            if file.endswith(file_extension):
                file_path = os.path.join(root, file)
                current_section = ""
                current_subsection = ""
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        for line_num, line in enumerate(f, 1):
                            if file_extension == ".txt":
                                sec_match = section_pattern.match(line)
                                if sec_match:
                                    current_section = sec_match.group(1).strip()
                                    current_subsection = ""  # Reset on new section
                                subsec_match = subsection_pattern.match(line)
                                if subsec_match:
                                    current_subsection = subsec_match.group(1).strip()

                            found_articles = set()
                            for name, pattern in PATTERNS.items():
                                matches = re.findall(pattern, line, re.IGNORECASE)
                                if not matches: continue
                                
                                if name == 'p2':
                                    for match_list in matches:
                                        found_articles.update(_split_article_list(match_list))
                                else:
                                    processed = [m[0] if isinstance(m, tuple) else m for m in matches if (m[0] if isinstance(m, tuple) else m)]
                                    found_articles.update(processed)
                            
                            for article in found_articles:
                                if article:
                                    main_article_match = re.match(r'(\d+[a-zA-Z]*)', str(article))
                                    main_article = main_article_match.group(1) if main_article_match else article
                                    
                                    agg_file = aggregated_results[main_article][file_path]
                                    agg_file['lines'].add(line_num)
                                    if file_extension == ".txt":
                                        agg_file['line_texts'][line_num] = line.strip()
                                        agg_file['section'] = current_section
                                        agg_file['subsection'] = current_subsection
                except Exception as e:
                    _log(f"Error processing file {file_path}: {e}", level="WARNING")

    # Format the results into a DataFrame
    output_data = []
    for article, file_details in aggregated_results.items():
        ref_parts = []
        for file_path, details in file_details.items():
            sorted_lines = sorted(list(details['lines']))
            line_numbers_str = ', '.join(map(str, sorted_lines))
            
            if file_extension == ".sas":
                # Format: filepath|line1,line2
                ref_parts.append(f"{file_path}|{line_numbers_str}")
            elif file_extension == ".txt":
                # Format: filepath|section|subsection|line1,line2|linetext1[NL]linetext2
                line_texts_str = '[NL]'.join([details['line_texts'][ln] for ln in sorted_lines])
                section = details.get('section', '')
                subsection = details.get('subsection', '')
                ref_parts.append(f"{file_path}|{section}|{subsection}|{line_numbers_str}|{line_texts_str}")

        ref_string = "; ".join(ref_parts)
        output_data.append({'Article': article, f'Referenced_In_{file_extension.upper()[1:]}': ref_string})

    _log(f"Finished scanning {file_extension} files.")
    return pd.DataFrame(output_data)

# =====================================================================================
# --- MAIN PIPELINE EXECUTION ---
# =====================================================================================

def main():
    """Main function to run the entire consolidated data pipeline."""
    _log("====== STARTING CONSOLIDATED CRR REPORT GENERATION ======")

    # --- Step 1: Connect to Jira ---
    try:
        with open(TOKEN_FILE_PATH, "r") as f:
            api_token = f.read().strip()
        if not api_token:
            _log(f"Jira token file is empty at {TOKEN_FILE_PATH}", level="ERROR")
            sys.exit(1)
        jira_conn = JIRA(server=JIRA_SERVER, token_auth=api_token)
        _log("Successfully connected to Jira.")
    except Exception as e:
        _log(f"Fatal: Could not connect to Jira. Error: {e}", level="ERROR")
        sys.exit(1)

    # --- Step 2: Fetch and Extract from Jira ---
    df_defects_raw = fetch_jira_data(jira_conn, JQL_DEFECTS, "Defects")
    df_reqts_raw = fetch_jira_data(jira_conn, JQL_REQTS, "Requirements")
    
    df_defects = extract_from_jira_df(df_defects_raw, "Defects")
    df_reqts = extract_from_jira_df(df_reqts_raw, "Requirements")

    # --- Step 3: Find References in Local Files ---
    df_sas_refs = find_references_in_files(SAS_SEARCH_DIRECTORY, ".sas")
    df_txt_refs = find_references_in_files(TXT_SEARCH_DIRECTORY, ".txt")

    # --- Step 4: Aggregate and Merge All Data ---
    _log("Aggregating and merging all data sources...")
    
    # Aggregate Jira data
    defects_grouped = df_defects.groupby('Article')['Issue_Info'].apply(lambda x: '; '.join(sorted(set(x)))).reset_index().rename(columns={'Issue_Info': 'Referenced_In_Defects'})
    reqts_grouped = df_reqts.groupby('Article')['Issue_Info'].apply(lambda x: '; '.join(sorted(set(x)))).reset_index().rename(columns={'Issue_Info': 'Referenced_In_Reqts'})

    # Load base TOC file
    try:
        df_toc = pd.read_excel(TOC_FILE)
        # --- Find the 'Out of scope' column case-insensitively ---
        out_of_scope_col = next((col for col in df_toc.columns if col.strip().lower() == 'out of scope'), None)
        if not out_of_scope_col:
            _log("'Out of scope' column not found in TOC. It will be omitted from the final report.", level="WARNING")
        
        df_toc['merge_key'] = df_toc['Article'].str.extract(r'Article\s+([0-9a-zA-Z]+)', expand=False).str.strip()
        df_toc.dropna(subset=['merge_key'], inplace=True)
    except FileNotFoundError:
        _log(f"TOC file not found at {TOC_FILE}", level="ERROR")
        sys.exit(1)

    # Merge all dataframes onto the TOC
    df_merged = pd.merge(df_toc, defects_grouped, left_on='merge_key', right_on='Article', how='left', suffixes=('', '_d'))
    df_merged = pd.merge(df_merged, reqts_grouped, left_on='merge_key', right_on='Article', how='left', suffixes=('', '_r'))
    df_merged = pd.merge(df_merged, df_sas_refs, left_on='merge_key', right_on='Article', how='left', suffixes=('', '_s'))
    df_merged = pd.merge(df_merged, df_txt_refs, left_on='merge_key', right_on='Article', how='left', suffixes=('', '_t'))

    # --- Step 5: Finalize and Clean the Report ---
    _log("Finalizing the report...")
    
    # Drop redundant 'Article' and 'merge_key' columns from merges
    df_final = df_merged.drop(columns=[col for col in df_merged.columns if '_d' in col or '_r' in col or '_s' in col or '_t' in col or col == 'merge_key'])
    
    # Fill NaN values with appropriate text
    for col in ['Referenced_In_Defects', 'Referenced_In_Reqts', 'Referenced_In_SAS', 'Referenced_In_TXT']:
        if col in df_final.columns:
            mask = df_final[col].isnull()
            if out_of_scope_col and out_of_scope_col in df_final.columns:
                 df_final.loc[mask, col] = df_final.loc[mask, out_of_scope_col].apply(
                    lambda x: 'Out of Scope' if str(x).strip().lower() == 'out of scope' else f'Not found in {col.split("_")[-1].lower()} scan'
                )
            else:
                df_final.loc[mask, col] = f'Not found in {col.split("_")[-1].lower()} scan'
        else:
            df_final[col] = f'Not found in {col.split("_")[-1].lower()} scan'

    # Define final column order
    final_cols_order = [
        'Article', 'Part Name', 'Title Name', 'Chapter Name', 'Section Name', 
        'Article Name', 'Article Content', 
        'Referenced_In_SAS', 'Referenced_In_TXT', 
        'Referenced_In_Defects', 'Referenced_In_Reqts'
    ]
    
    # Insert the 'Out of scope' column in the correct position if it exists
    if out_of_scope_col and out_of_scope_col in df_final.columns:
        try:
            insert_pos = final_cols_order.index('Article Content') + 1
            final_cols_order.insert(insert_pos, out_of_scope_col)
        except ValueError:
            final_cols_order.append(out_of_scope_col) # Fallback

    # Ensure all columns exist before reordering
    df_final = df_final[[col for col in final_cols_order if col in df_final.columns]]

    # --- Step 6: Save the Final Excel File ---
    try:
        _log(f"Saving final report to: {OUTPUT_EXCEL_FILE}")
        df_final.to_excel(OUTPUT_EXCEL_FILE, index=False, engine='openpyxl')
        _log("Report saved successfully.")
    except Exception as e:
        _log(f"Error saving the final Excel file: {e}", level="ERROR")

    _log("====== SCRIPT FINISHED ======", level="SUCCESS")

if __name__ == "__main__":
    # Before running, ensure you have installed the required packages:
    # pip install pandas openpyxl jira
    main()
