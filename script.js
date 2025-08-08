document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selection ---
    const fileUpload = document.getElementById('file-upload');
    const tableBody = document.querySelector('#data-table tbody');
    const tableHead = document.querySelector('#data-table thead');
    const tooltip = document.getElementById('line-tooltip');
    const refreshBtn = document.getElementById('refresh-data-btn');
    const refreshStatus = document.getElementById('refresh-status');

    // Filters
    const partNameFilter = document.getElementById('part-name-filter');
    const titleNameFilter = document.getElementById('title-name-filter');
    const chapterNameFilter = document.getElementById('chapter-name-filter');
    const sectionNameFilter = document.getElementById('section-name-filter');
    const sasFileFilter = document.getElementById('sas-file-filter');
    const articleNoFilter = document.getElementById('article-no-filter');
    const issueIdFilter = document.getElementById('issue-id-filter');
    const allFilters = [
        partNameFilter, titleNameFilter, chapterNameFilter,
        sectionNameFilter, sasFileFilter, articleNoFilter, issueIdFilter
    ];

    // Buttons
    const filterBtn = document.getElementById('filter-btn');
    const resetBtn = document.getElementById('reset-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const exportExcelBtn = document.getElementById('export-excel-btn');
    const visualsBtn = document.getElementById('visuals-btn');
    const columnToggleBtn = document.getElementById('column-toggle-btn');
    const columnToggleDropdown = document.getElementById('column-toggle-dropdown');
    const filterDefectsBtn = document.getElementById('filter-defects-btn');
    const filterReqtsBtn = document.getElementById('filter-reqts-btn');

    // Dashboard / Modal
    const dashboardModal = document.getElementById('dashboard-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const supportChartCanvas = document.getElementById('support-chart');
    const topFilesChartCanvas = document.getElementById('top-files-chart');
    const issueCoverageChartCanvas = document.getElementById('issue-coverage-chart');
    const toggleDashboardBtn = document.createElement('button'); // Dynamically created or use existing
    toggleDashboardBtn.textContent = 'Collapse';
    toggleDashboardBtn.className = 'minimize-btn';

    // Add toggle button to modal header if not present
    const dashboardHeader = dashboardModal.querySelector('.dashboard-header');
    if (dashboardHeader && !document.getElementById('toggle-dashboard-btn')) {
        toggleDashboardBtn.id = 'toggle-dashboard-btn';
        dashboardHeader.insertBefore(toggleDashboardBtn, closeModalBtn);
    }

    const dashboardContainer = document.getElementById('dashboard-container');

    let fullData = [];
    let supportChart, topFilesChart, issueCoverageChart;

    // --- Column Configuration ---
    const columnConfig = [
        { dataKey: 'Article', header: 'Article', visible: true },
        { dataKey: 'Article Name', header: 'Article Name', visible: true },
        { dataKey: 'Article Content', header: 'Article Content', visible: true },
        { dataKey: 'Out of scope', header: 'Out of Scope', visible: false },
        { dataKey: 'Referenced_In_SAS', header: 'Referenced In SAS', visible: true },
        { dataKey: 'Referenced_In_TXT', header: 'Referenced In TXT', visible: true },
        { dataKey: 'Referenced_In_Defects', header: 'Referenced In Defects', visible: true },
        { dataKey: 'Referenced_In_Reqts', header: 'Referenced In Requirements', visible: true },
    ];

    // --- Event Listeners ---
    fileUpload.addEventListener('change', handleFileUpload);
    refreshBtn.addEventListener('click', handleRefreshData);
    filterBtn.addEventListener('click', applyFiltersAndDisplay);
    resetBtn.addEventListener('click', resetAll);
    visualsBtn.addEventListener('click', updateDashboard);
    exportPdfBtn.addEventListener('click', exportToPDF);
    exportExcelBtn.addEventListener('click', exportToExcel);
    toggleDashboardBtn.addEventListener('click', toggleDashboard);
    filterDefectsBtn.addEventListener('click', showOnlyWithDefects);
    filterReqtsBtn.addEventListener('click', showOnlyWithRequirements);

    // Hierarchical & Text Filters
    partNameFilter.addEventListener('change', handlePartChange);
    titleNameFilter.addEventListener('change', handleTitleChange);
    chapterNameFilter.addEventListener('change', handleChapterChange);
    [articleNoFilter, sasFileFilter, issueIdFilter].forEach(input => {
        input.addEventListener('input', applyFiltersAndDisplay);
    });

    // Column Toggle Dropdown
    columnToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        columnToggleDropdown.style.display = columnToggleDropdown.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => {
        if (columnToggleDropdown.style.display === 'block') {
            columnToggleDropdown.style.display = 'none';
        }
    });

    // Close modal when clicking X or outside
    closeModalBtn.addEventListener('click', () => {
        dashboardModal.style.display = 'none';
        if (supportChart) supportChart.destroy();
        if (topFilesChart) topFilesChart.destroy();
        if (issueCoverageChart) issueCoverageChart.destroy();
    });
    dashboardModal.addEventListener('click', (e) => {
        if (e.target === dashboardModal) {
            closeModalBtn.click();
        }
    });

    // --- Pipeline Refresh Logic ---
    async function handleRefreshData() {
        refreshBtn.disabled = true;
        refreshStatus.textContent = 'Processing... The data pipeline is running. This may take a few minutes.';
        refreshStatus.className = 'status-message loading';
        try {
            const response = await fetch('http://127.0.0.1:5000/run-pipeline', {
                method: 'POST',
            });
            const result = await response.json();
            if (response.ok) {
                refreshStatus.textContent = 'Success! The pipeline has completed. You can now upload the new "CRR_Full_Combined_Report.xlsx" file.';
                refreshStatus.className = 'status-message success';
            } else {
                refreshStatus.textContent = `Error: ${result.message || 'An unknown error occurred.'}`;
                refreshStatus.className = 'status-message error';
                console.error('Pipeline Error:', result.error_details);
            }
        } catch (error) {
            refreshStatus.textContent = 'Failed to connect to the local server. Is it running? (Run "python server.py")';
            refreshStatus.className = 'status-message error';
            console.error('Network Error:', error);
        } finally {
            refreshBtn.disabled = false;
        }
    }

    // --- File Handling ---
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                fullData = XLSX.utils.sheet_to_json(worksheet);
                resetUI(true);
                populateBaseFilters();
                applyFiltersAndDisplay();
            } catch (error) {
                console.error("Error processing Excel file:", error);
                alert("There was an error processing your Excel file.");
                resetUI(false);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // --- Filter Logic ---
    function applyFiltersAndDisplay() {
        const filters = {
            part: partNameFilter.value,
            title: titleNameFilter.value,
            chapter: chapterNameFilter.value,
            section: sectionNameFilter.value,
            article: articleNoFilter.value.toLowerCase(),
            sas: sasFileFilter.value.toLowerCase(),
            issue: issueIdFilter.value.toLowerCase(),
        };
        const filteredData = fullData.filter(row => {
            const articleNo = String(row['Article'] || '').toLowerCase();
            const sasFiles = (row['Referenced_In_SAS'] || '').toLowerCase();
            const defects = (row['Referenced_In_Defects'] || '').toLowerCase();
            const reqts = (row['Referenced_In_Reqts'] || '').toLowerCase();
            return (!filters.part || row['Part Name'] === filters.part) &&
                   (!filters.title || row['Title Name'] === filters.title) &&
                   (!filters.chapter || row['Chapter Name'] === filters.chapter) &&
                   (!filters.section || row['Section Name'] === filters.section) &&
                   articleNo.includes(filters.article) &&
                   sasFiles.includes(filters.sas) &&
                   (defects.includes(filters.issue) || reqts.includes(filters.issue));
        });
        displayData(filteredData);
        visualsBtn.disabled = filteredData.length === 0;
        exportPdfBtn.disabled = filteredData.length === 0;
        exportExcelBtn.disabled = filteredData.length === 0;
    }

    function showOnlyWithDefects() {
        const baseFilteredData = getFilteredData();
        const defectData = baseFilteredData.filter(row => {
            const defects = row['Referenced_In_Defects'] || '';
            return !defects.toLowerCase().startsWith('not found') && !defects.toLowerCase().startsWith('out of scope');
        });
        displayData(defectData);
    }

    function showOnlyWithRequirements() {
        const baseFilteredData = getFilteredData();
        const reqtData = baseFilteredData.filter(row => {
            const reqts = row['Referenced_In_Reqts'] || '';
            return !reqts.toLowerCase().startsWith('not found') && !reqts.toLowerCase().startsWith('out of scope');
        });
        displayData(reqtData);
    }

    function getFilteredData() {
        const filters = {
            part: partNameFilter.value,
            title: titleNameFilter.value,
            chapter: chapterNameFilter.value,
            section: sectionNameFilter.value,
            article: articleNoFilter.value.toLowerCase(),
            sas: sasFileFilter.value.toLowerCase(),
            issue: issueIdFilter.value.toLowerCase(),
        };
        return fullData.filter(row => {
            const articleNo = String(row['Article'] || '').toLowerCase();
            const sasFiles = (row['Referenced_In_SAS'] || '').toLowerCase();
            const defects = (row['Referenced_In_Defects'] || '').toLowerCase();
            const reqts = (row['Referenced_In_Reqts'] || '').toLowerCase();
            return (!filters.part || row['Part Name'] === filters.part) &&
                   (!filters.title || row['Title Name'] === filters.title) &&
                   (!filters.chapter || row['Chapter Name'] === filters.chapter) &&
                   (!filters.section || row['Section Name'] === filters.section) &&
                   articleNo.includes(filters.article) &&
                   sasFiles.includes(filters.sas) &&
                   (defects.includes(filters.issue) || reqts.includes(filters.issue));
        });
    }

    function resetAll() {
        allFilters.forEach(f => f.value = '');
        handlePartChange();
        applyFiltersAndDisplay();
        dashboardModal.style.display = 'none'; // Hide modal on reset
        if (supportChart) supportChart.destroy();
        if (topFilesChart) topFilesChart.destroy();
        if (issueCoverageChart) issueCoverageChart.destroy();
    }

    // --- Hierarchical Filter Population ---
    function populateBaseFilters() {
        const partNames = [...new Set(fullData.map(row => row['Part Name']).filter(Boolean))];
        updateDropdown(partNameFilter, partNames, 'Part Name');
    }

    function handlePartChange() {
        const dependentData = partNameFilter.value ? fullData.filter(row => row['Part Name'] === partNameFilter.value) : [];
        const titleNames = [...new Set(dependentData.map(row => row['Title Name']).filter(Boolean))];
        updateDropdown(titleNameFilter, titleNames, 'Title Name');
        titleNameFilter.disabled = !partNameFilter.value;
        handleTitleChange();
    }

    function handleTitleChange() {
        const dependentData = titleNameFilter.value ? fullData.filter(row => row['Part Name'] === partNameFilter.value && row['Title Name'] === titleNameFilter.value) : [];
        const chapterNames = [...new Set(dependentData.map(row => row['Chapter Name']).filter(Boolean))];
        updateDropdown(chapterNameFilter, chapterNames, 'Chapter Name');
        chapterNameFilter.disabled = !titleNameFilter.value;
        handleChapterChange();
    }

    function handleChapterChange() {
        const dependentData = chapterNameFilter.value ? fullData.filter(row => row['Part Name'] === partNameFilter.value && row['Title Name'] === titleNameFilter.value && row['Chapter Name'] === chapterNameFilter.value) : [];
        const sectionNames = [...new Set(dependentData.map(row => row['Section Name']).filter(Boolean))];
        updateDropdown(sectionNameFilter, sectionNames, 'Section Name');
        sectionNameFilter.disabled = !chapterNameFilter.value;
    }

    // --- UI and Data Display ---
    function createGitLabLink(filePath, lineNumber) {
        const localPrefix = 'C:\\Users\\sinjav\\Documents\\';
        const trimmedFilePath = filePath.trim();
        if (!trimmedFilePath.startsWith(localPrefix)) return '#';
        let repoPath = trimmedFilePath.substring(localPrefix.length).replace(/\\/g, '/');
        const pathComponents = repoPath.split('/');
        const projectName = pathComponents.shift();
        const pathInProject = pathComponents.join('/');
        let finalUrl = `https://gitlab.sas.com/risk/${projectName}/-/blob/develop/${pathInProject}`;
        if (lineNumber) finalUrl += `#L${lineNumber}`;
        return finalUrl;
    }

    function displayData(data) {
        tableHead.innerHTML = '<tr></tr>';
        tableBody.innerHTML = '';
        const headerRow = tableHead.querySelector('tr');
        const visibleColumns = columnConfig.filter(c => c.visible);
        visibleColumns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.header;
            headerRow.appendChild(th);
        });
        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${visibleColumns.length || 1}" style="text-align: center;">No data to display.</td></tr>`;
            return;
        }
        data.forEach(rowData => {
            const row = tableBody.insertRow();
            visibleColumns.forEach(col => {
                const cell = row.insertCell();
                const content = rowData[col.dataKey] || '';
                renderCellContent(cell, col.dataKey, content);
            });
        });
    }

    function renderCellContent(cell, colName, content) {
        if (colName === 'Article Content') {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'article-content-container';
            contentDiv.innerHTML = String(content).replace(/\n/g, '<br>');
            cell.appendChild(contentDiv);
            if (String(content).length > 300) {
                contentDiv.classList.add('collapsed');
                const readMoreBtn = document.createElement('button');
                readMoreBtn.className = 'read-more-btn';
                readMoreBtn.textContent = 'Read more...';
                readMoreBtn.addEventListener('click', () => {
                    contentDiv.classList.toggle('expanded');
                    readMoreBtn.textContent = contentDiv.classList.contains('expanded') ? 'Read less...' : 'Read more...';
                });
                cell.appendChild(readMoreBtn);
            }
        } else if (['Referenced_In_Defects', 'Referenced_In_Reqts'].includes(colName)) {
            const list = document.createElement('ul');
            if (content && !String(content).toLowerCase().startsWith('not found')) {
                String(content).split('; ').forEach(itemText => {
                    const match = itemText.match(/([A-Z]+-\d+)/);
                    if (match) {
                        const key = match[0];
                        const url = `https://rndjira.sas.com/browse/${key}`;
                        const parts = itemText.split(key);
                        const listItem = document.createElement('li');
                        listItem.appendChild(document.createTextNode(parts[0]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.textContent = key;
                        link.target = '_blank';
                        listItem.appendChild(link);
                        listItem.appendChild(document.createTextNode(parts[1]));
                        list.appendChild(listItem);
                    } else {
                        const li = document.createElement('li');
                        li.textContent = itemText;
                        list.appendChild(li);
                    }
                });
            } else {
                cell.textContent = content;
            }
            cell.appendChild(list);
        } else if (colName === 'Referenced_In_SAS') {
            const list = document.createElement('ul');
            if (content && !String(content).toLowerCase().startsWith('not found')) {
                String(content).split('; ').forEach(entry => {
                    const parts = entry.split('|');
                    if (parts.length !== 2) {
                        const li = document.createElement('li');
                        li.textContent = entry;
                        list.appendChild(li);
                        return;
                    }
                    const [filePath, lineNumbersStr] = parts;
                    const fileName = filePath.substring(filePath.lastIndexOf('\\') + 1) || filePath.substring(filePath.lastIndexOf('/') + 1);
                    const lineLinks = lineNumbersStr.split(', ').map(line =>
                        `<a href="${createGitLabLink(filePath, line)}" target="_blank">${line}</a>`
                    ).join(' ');
                    const listItem = document.createElement('li');
                    listItem.innerHTML = `${fileName} (${lineLinks})`;
                    list.appendChild(listItem);
                });
            } else {
                cell.textContent = content;
            }
            cell.appendChild(list);
        } else if (colName === 'Referenced_In_TXT') {
            const list = document.createElement('ul');
            if (content && !String(content).toLowerCase().startsWith('not found')) {
                String(content).split('; ').forEach(entry => {
                    const parts = entry.split('|');
                    if (parts.length < 5) {
                        const li = document.createElement('li');
                        li.textContent = entry;
                        list.appendChild(li);
                        return;
                    }
                    const filePath = parts[0];
                    const section = parts[1];
                    const subsection = parts[2];
                    const lineNumbers = parts[3];
                    const lineTexts = parts.slice(4).join('|');
                    const fileName = filePath.substring(filePath.lastIndexOf('\\') + 1) || filePath.substring(filePath.lastIndexOf('/') + 1);
                    const lineLinks = lineNumbers.split(', ').map((line, index) => {
                        const lineText = (lineTexts.split('[NL]')[index] || '').trim();
                        const infoIcon = `<span class="info-icon" data-text="${encodeURIComponent(lineText)}">i</span>`;
                        return `<a href="${createGitLabLink(filePath, line)}" target="_blank">${line}</a>${infoIcon}`;
                    }).join(' ');
                    const listItem = document.createElement('li');
                    listItem.innerHTML = `${fileName} (${section}, ${subsection}) (${lineLinks})`;
                    list.appendChild(listItem);
                });
                list.querySelectorAll('.info-icon').forEach(icon => {
                    icon.addEventListener('mouseover', (event) => {
                        tooltip.textContent = decodeURIComponent(event.target.getAttribute('data-text'));
                        tooltip.style.display = 'block';
                        const rect = event.target.getBoundingClientRect();
                        tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2 - tooltip.offsetWidth / 2}px`;
                        tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 5}px`;
                    });
                    icon.addEventListener('mouseout', () => {
                        tooltip.style.display = 'none';
                    });
                });
            } else {
                cell.textContent = content;
            }
            cell.appendChild(list);
        } else {
            cell.textContent = content;
        }
    }

    // --- Dashboard & Chart Logic ---
    function updateDashboard() {
        if (fullData.length === 0) return;
        dashboardModal.style.display = 'flex'; // Show modal
        updateCharts();
    }

    function updateCharts() {
        const data = fullData;
        const style = getComputedStyle(document.body);
        const colors = {
            primary: style.getPropertyValue('--primary-color').trim(),
            success: style.getPropertyValue('--success-color').trim(),
            danger: style.getPropertyValue('--danger-color').trim(),
            warning: style.getPropertyValue('--warning-color').trim(),
            bg: style.getPropertyValue('--light-grey-bg').trim()
        };

        // Chart 1: Article Support Status
        let supported = 0, notSupported = 0, outOfScope = 0;
        data.forEach(row => {
            const sas = row['Referenced_In_SAS'] || '';
            const txt = row['Referenced_In_TXT'] || '';
            if (String(row['Out of scope']).toLowerCase() === 'out of scope' || sas.toLowerCase() === 'out of scope' || txt.toLowerCase() === 'out of scope') {
                outOfScope++;
            } else if (!sas.toLowerCase().startsWith('not found') || !txt.toLowerCase().startsWith('not found')) {
                supported++;
            } else {
                notSupported++;
            }
        });
        if (supportChart) supportChart.destroy();
        supportChart = new Chart(supportChartCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Supported', 'Not Supported', 'Out of Scope'],
                datasets: [{ data: [supported, notSupported, outOfScope], backgroundColor: [colors.success, colors.danger, colors.warning], borderColor: colors.bg, borderWidth: 4 }]
            },
            options: { responsive: true, plugins: { legend: { position: 'top' } } }
        });

        // Chart 2: Top 5 Referenced SAS Files
        const sasFileCounts = new Map();
        data.forEach(row => {
            const sasFiles = row['Referenced_In_SAS'] || '';
            if (!sasFiles.toLowerCase().startsWith('not found') && sasFiles.toLowerCase() !== 'out of scope') {
                sasFiles.split('; ').forEach(entry => {
                    const fileName = entry.split(' (')[0];
                    if (fileName.toLowerCase().endsWith('.sas')) {
                        sasFileCounts.set(fileName, (sasFileCounts.get(fileName) || 0) + 1);
                    }
                });
            }
        });
        const sortedSasFiles = [...sasFileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (topFilesChart) topFilesChart.destroy();
        topFilesChart = new Chart(topFilesChartCanvas, {
            type: 'bar',
            data: {
                labels: sortedSasFiles.map(d => d[0]),
                datasets: [{ label: 'Reference Count', data: sortedSasFiles.map(d => d[1]), backgroundColor: colors.primary }]
            },
            options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } }
        });

        // Chart 3: Issue Coverage
        const withIssues = data.filter(row => {
            const defects = row['Referenced_In_Defects'] || '';
            const reqts = row['Referenced_In_Reqts'] || '';
            return (!defects.toLowerCase().startsWith('not found') && !defects.toLowerCase().startsWith('out of scope')) ||
                   (!reqts.toLowerCase().startsWith('not found') && !reqts.toLowerCase().startsWith('out of scope'));
        }).length;
        const withoutIssues = data.length - withIssues;
        if (issueCoverageChart) issueCoverageChart.destroy();
        issueCoverageChart = new Chart(issueCoverageChartCanvas, {
            type: 'doughnut',
            data: {
                labels: ['With Issues', 'Without Issues'],
                datasets: [{ data: [withIssues, withoutIssues], backgroundColor: [colors.danger, colors.success], borderColor: colors.bg, borderWidth: 4 }]
            },
            options: { responsive: true, plugins: { legend: { position: 'top' } } }
        });
    }

    function toggleDashboard() {
        const isCollapsed = dashboardContainer.classList.toggle('collapsed');
        toggleDashboardBtn.textContent = isCollapsed ? 'Expand' : 'Collapse';
    }

    // --- Export and Utility Functions ---
    function exportToPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        const visibleColumns = columnConfig.filter(c => c.visible);
        const head = [visibleColumns.map(c => c.header)];
        const body = Array.from(tableBody.querySelectorAll('tr')).map(row =>
            Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.replace(/\s\s+/g, ' ').trim())
        );
        doc.autoTable({
            head: head, body: body, styles: { fontSize: 5, cellPadding: 2, overflow: 'linebreak' },
            margin: { top: 40 }, didDrawPage: data => doc.setFontSize(20).text("Consolidated CRR Report", data.settings.margin.left, 30)
        });
        doc.save('crr_full_report.pdf');
    }

    function exportToExcel() {
        const visibleKeys = columnConfig.filter(c => c.visible).map(c => c.dataKey);
        const dataToExport = Array.from(tableBody.querySelectorAll('tr')).map(row => {
            const article = row.cells[0]?.textContent;
            if (!article) return null;
            const originalRow = fullData.find(d => String(d.Article) === article) || {};
            const exportRow = {};
            visibleKeys.forEach(key => {
                exportRow[key] = originalRow[key];
            });
            return exportRow;
        }).filter(Boolean);
        if (dataToExport.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtered Report');
        XLSX.writeFile(workbook, 'crr_full_report_filtered.xlsx');
    }

    function updateDropdown(select, options, name) {
        select.innerHTML = `<option value="">-- Select ${name} --</option>`;
        options.sort().forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });
    }

    function resetUI(enable) {
        allFilters.forEach(control => {
            control.disabled = !enable;
            if (control.tagName === 'SELECT') {
                control.innerHTML = `<option value="">-- Select --</option>`;
            } else {
                control.value = '';
            }
        });
        [filterBtn, resetBtn, exportPdfBtn, exportExcelBtn, visualsBtn, columnToggleBtn, filterDefectsBtn, filterReqtsBtn].forEach(btn => btn.disabled = !enable);
        if (!enable) {
            tableBody.innerHTML = `<tr><td colspan="${columnConfig.length}" style="text-align: center;">Please upload the 'CRR_Full_Combined_Report.xlsx' file.</td></tr>`;
        }
    }

    function initializeColumnToggles() {
        columnToggleDropdown.innerHTML = '';
        columnConfig.forEach((col, index) => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = col.visible;
            checkbox.dataset.columnIndex = index;
            checkbox.addEventListener('change', (e) => {
                columnConfig[index].visible = e.target.checked;
                applyFiltersAndDisplay();
            });
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(col.header));
            columnToggleDropdown.appendChild(label);
        });
    }

    // --- Initial State ---
    initializeColumnToggles();
    resetUI(false);
});