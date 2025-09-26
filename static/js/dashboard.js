// Nigzsu Dashboard JavaScript

let currentData = null;
let chartInstances = {};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    setupEventListeners();
});

function setupEventListeners() {
    // Filter form submission
    document.getElementById('filterForm').addEventListener('submit', function(e) {
        e.preventDefault();
        loadDashboardData();
    });

    // CSV upload functionality
    const uploadArea = document.getElementById('uploadArea');
    const csvUpload = document.getElementById('csvUpload');

    uploadArea.addEventListener('click', () => csvUpload.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleDrop);
    csvUpload.addEventListener('change', handleFileSelect);

    // Tab switching
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(e) {
            // Refresh charts when tab is shown
            setTimeout(refreshVisibleCharts, 100);
        });
    });
}

function loadDashboardData() {
    showLoading();
    
    const formData = new FormData(document.getElementById('filterForm'));
    const params = new URLSearchParams(formData);
    
    fetch('/api/chart-data?' + params.toString())
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showError(data.error);
                return;
            }
            currentData = data;
            generateAllCharts();
        })
        .catch(error => {
            console.error('Error loading data:', error);
            showError('Failed to load dashboard data');
        });
}

function showLoading() {
    const chartContainers = document.querySelectorAll('[id$="Chart"], [id^="live"], [id^="foot"], [id^="age"], [id^="gender"], [id^="dwell"], [id^="peak"], [id^="entry"], [id^="occupancy"], [id^="weekly"], [id^="demographic"]');
    chartContainers.forEach(container => {
        container.innerHTML = '<div class="chart-loading">Loading chart...</div>';
    });
}

function showError(message) {
    const chartContainers = document.querySelectorAll('[id$="Chart"], [id^="live"], [id^="foot"], [id^="age"], [id^="gender"], [id^="dwell"], [id^="peak"], [id^="entry"], [id^="occupancy"], [id^="weekly"], [id^="demographic"]');
    chartContainers.forEach(container => {
        container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
    });
}

function generateAllCharts() {
    if (!currentData || !currentData.data) {
        showError('No data available');
        return;
    }

    const data = currentData.data;
    
    // Time-based metrics
    generateLiveOccupancy(data);
    generateFootTraffic(data);
    generateOccupancyTrend(data);
    generateWeeklyPattern(data);
    
    // Demographics
    generateAgeDistribution(data);
    generateGenderBreakdown(data);
    generateDwellTimeByAge(data);
    
    // Entry/Exit metrics
    generatePeakEntryTimes(data);
    generateEntryExitRatio(data);
    generateDemographicFlow(data);
}

function generateLiveOccupancy(data) {
    const currentHour = new Date().getHours();
    const currentData = data.filter(d => new Date(d.timestamp).getHours() === currentHour);
    
    const occupancyData = [{
        x: ['Current Hour'],
        y: [currentData.length],
        type: 'bar',
        marker: { color: '#0d6efd' }
    }];
    
    const layout = {
        title: 'Live Occupancy (Current Hour)',
        xaxis: { title: 'Time Period' },
        yaxis: { title: 'Number of People' },
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };
    
    Plotly.newPlot('liveOccupancy', occupancyData, layout, {responsive: true});
    chartInstances['liveOccupancy'] = { data: occupancyData, layout: layout };
}

function generateFootTraffic(data) {
    const hourlyData = {};
    data.forEach(d => {
        const hour = new Date(d.timestamp).getHours();
        hourlyData[hour] = (hourlyData[hour] || 0) + 1;
    });
    
    const hours = Object.keys(hourlyData).sort((a, b) => a - b);
    const counts = hours.map(h => hourlyData[h]);
    
    const trafficData = [{
        x: hours.map(h => `${h}:00`),
        y: counts,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#198754' }
    }];
    
    const layout = {
        title: 'Foot Traffic Over Time',
        xaxis: { title: 'Hour of Day' },
        yaxis: { title: 'Number of People' },
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };
    
    Plotly.newPlot('footTraffic', trafficData, layout, {responsive: true});
    chartInstances['footTraffic'] = { data: trafficData, layout: layout };
}

function generateOccupancyTrend(data) {
    const dailyData = {};
    data.forEach(d => {
        const date = new Date(d.timestamp).toDateString();
        dailyData[date] = (dailyData[date] || 0) + 1;
    });
    
    const dates = Object.keys(dailyData).sort();
    const counts = dates.map(d => dailyData[d]);
    
    const trendData = [{
        x: dates,
        y: counts,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#dc3545' }
    }];
    
    const layout = {
        title: 'Occupancy Trend by Day',
        xaxis: { title: 'Date' },
        yaxis: { title: 'Total People' },
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };
    
    Plotly.newPlot('occupancyTrend', trendData, layout, {responsive: true});
    chartInstances['occupancyTrend'] = { data: trendData, layout: layout };
}

function generateWeeklyPattern(data) {
    const weeklyData = {};
    data.forEach(d => {
        const dayOfWeek = new Date(d.timestamp).toLocaleDateString('en-US', { weekday: 'long' });
        weeklyData[dayOfWeek] = (weeklyData[dayOfWeek] || 0) + 1;
    });
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const counts = days.map(d => weeklyData[d] || 0);
    
    const weeklyPatternData = [{
        x: days,
        y: counts,
        type: 'bar',
        marker: { color: '#fd7e14' }
    }];
    
    const layout = {
        title: 'Weekly Traffic Pattern',
        xaxis: { title: 'Day of Week' },
        yaxis: { title: 'Total People' },
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };
    
    Plotly.newPlot('weeklyPattern', weeklyPatternData, layout, {responsive: true});
    chartInstances['weeklyPattern'] = { data: weeklyPatternData, layout: layout };
}

function generateAgeDistribution(data) {
    const ageGroups = {};
    data.forEach(d => {
        ageGroups[d.age_estimate] = (ageGroups[d.age_estimate] || 0) + 1;
    });
    
    const ageData = [{
        labels: Object.keys(ageGroups),
        values: Object.values(ageGroups),
        type: 'pie',
        marker: { colors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'] }
    }];
    
    const layout = {
        title: 'Age Distribution',
        margin: { t: 40, b: 40, l: 40, r: 40 }
    };
    
    Plotly.newPlot('ageDistribution', ageData, layout, {responsive: true});
    chartInstances['ageDistribution'] = { data: ageData, layout: layout };
}

function generateGenderBreakdown(data) {
    const genderData = {};
    data.forEach(d => {
        genderData[d.sex] = (genderData[d.sex] || 0) + 1;
    });
    
    const genderChart = [{
        labels: Object.keys(genderData),
        values: Object.values(genderData),
        type: 'pie',
        marker: { colors: ['#36A2EB', '#FF6384'] }
    }];
    
    const layout = {
        title: 'Gender Breakdown',
        margin: { t: 40, b: 40, l: 40, r: 40 }
    };
    
    Plotly.newPlot('genderBreakdown', genderChart, layout, {responsive: true});
    chartInstances['genderBreakdown'] = { data: genderChart, layout: layout };
}

function generateDwellTimeByAge(data) {
    // Calculate average dwell time by age group
    const ageGroupTimes = {};
    data.forEach(d => {
        if (!ageGroupTimes[d.age_estimate]) {
            ageGroupTimes[d.age_estimate] = [];
        }
        // Simulate dwell time based on age group for demo
        const baseDwellTime = getBaseDwellTime(d.age_estimate);
        ageGroupTimes[d.age_estimate].push(baseDwellTime + Math.random() * 10);
    });
    
    const avgTimes = {};
    Object.keys(ageGroupTimes).forEach(age => {
        const times = ageGroupTimes[age];
        avgTimes[age] = times.reduce((a, b) => a + b, 0) / times.length;
    });
    
    const dwellData = [{
        x: Object.keys(avgTimes),
        y: Object.values(avgTimes),
        type: 'bar',
        marker: { color: '#20C997' }
    }];
    
    const layout = {
        title: 'Average Dwell Time by Age Group',
        xaxis: { title: 'Age Group' },
        yaxis: { title: 'Average Dwell Time (minutes)' },
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };
    
    Plotly.newPlot('dwellTimeByAge', dwellData, layout, {responsive: true});
    chartInstances['dwellTimeByAge'] = { data: dwellData, layout: layout };
}

function generatePeakEntryTimes(data) {
    const entryTimes = {};
    data.filter(d => d.event === 'entry').forEach(d => {
        const hour = new Date(d.timestamp).getHours();
        const gender = d.sex;
        if (!entryTimes[gender]) entryTimes[gender] = {};
        entryTimes[gender][hour] = (entryTimes[gender][hour] || 0) + 1;
    });
    
    const peakData = Object.keys(entryTimes).map(gender => ({
        x: Object.keys(entryTimes[gender]).sort((a, b) => a - b).map(h => `${h}:00`),
        y: Object.keys(entryTimes[gender]).sort((a, b) => a - b).map(h => entryTimes[gender][h]),
        name: gender === 'M' ? 'Male' : 'Female',
        type: 'bar'
    }));
    
    const layout = {
        title: 'Peak Entry Times by Gender',
        xaxis: { title: 'Hour of Day' },
        yaxis: { title: 'Number of Entries' },
        barmode: 'group',
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };
    
    Plotly.newPlot('peakEntryTimes', peakData, layout, {responsive: true});
    chartInstances['peakEntryTimes'] = { data: peakData, layout: layout };
}

function generateEntryExitRatio(data) {
    const entries = data.filter(d => d.event === 'entry').length;
    const exits = data.filter(d => d.event === 'exit').length;
    
    const ratioData = [{
        labels: ['Entries', 'Exits'],
        values: [entries, exits],
        type: 'pie',
        marker: { colors: ['#28A745', '#DC3545'] }
    }];
    
    const layout = {
        title: 'Entry-to-Exit Ratio',
        margin: { t: 40, b: 40, l: 40, r: 40 }
    };
    
    Plotly.newPlot('entryExitRatio', ratioData, layout, {responsive: true});
    chartInstances['entryExitRatio'] = { data: ratioData, layout: layout };
}

function generateDemographicFlow(data) {
    const flowData = {};
    data.forEach(d => {
        const key = `${d.sex}-${d.age_estimate}`;
        flowData[key] = (flowData[key] || 0) + 1;
    });
    
    const demographicData = [{
        x: Object.keys(flowData),
        y: Object.values(flowData),
        type: 'bar',
        marker: { color: '#6F42C1' }
    }];
    
    const layout = {
        title: 'Demographic Flow',
        xaxis: { title: 'Gender-Age Group' },
        yaxis: { title: 'Count' },
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };
    
    Plotly.newPlot('demographicFlow', demographicData, layout, {responsive: true});
    chartInstances['demographicFlow'] = { data: demographicData, layout: layout };
}

function getBaseDwellTime(ageGroup) {
    const baseTimes = {
        '(0,8)': 15,
        '(9,16)': 25,
        '(17,25)': 35,
        '(25,40)': 45,
        '(40,60)': 55,
        '(60+)': 40
    };
    return baseTimes[ageGroup] || 30;
}

function refreshVisibleCharts() {
    // Redraw all visible charts to ensure proper sizing
    Object.keys(chartInstances).forEach(chartId => {
        const element = document.getElementById(chartId);
        if (element && element.offsetParent !== null) {
            Plotly.Plots.resize(element);
        }
    });
}

function exportChart(chartId, format) {
    if (!chartInstances[chartId]) {
        alert('Chart not available for export');
        return;
    }
    
    if (format === 'png') {
        Plotly.downloadImage(chartId, {
            format: 'png',
            width: 1200,
            height: 800,
            filename: `nigzsu-${chartId}-${new Date().toISOString().split('T')[0]}`
        });
    } else if (format === 'csv') {
        exportChartDataAsCSV(chartId);
    }
}

function exportChartDataAsCSV(chartId) {
    if (!currentData || !currentData.data) {
        alert('No data available for export');
        return;
    }
    
    const csvContent = convertToCSV(currentData.data);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nigzsu-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
        });
        csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
}

// File upload functions
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        uploadFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        uploadFile(files[0]);
    }
}

function uploadFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showUploadStatus('Please select a CSV file', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    showUploadStatus('Uploading file...', 'info');
    
    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showUploadStatus('File uploaded successfully', 'success');
        } else {
            showUploadStatus(data.error || 'Upload failed', 'error');
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
        showUploadStatus('Upload failed', 'error');
    });
}

function showUploadStatus(message, type) {
    const statusDiv = document.getElementById('uploadStatus');
    const alertClass = type === 'success' ? 'alert-success' : 
                     type === 'error' ? 'alert-danger' : 'alert-info';
    
    statusDiv.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
    
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.innerHTML = '';
        }, 5000);
    }
}