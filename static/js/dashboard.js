// Nigzsu Dashboard JavaScript

let currentData = null;
let chartInstances = {};
let filterBuilder = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard initializing...');
    try {
        loadDashboardData();
        setupEventListeners();
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        showError('JavaScript initialization failed: ' + error.message);
    }
});

// Advanced Filter Builder Class
class FilterBuilder {
    constructor() {
        this.conditionGroups = [
            { logic: 'AND', conditions: [] }
        ];
        this.conditionTypes = {
            'timestamp': { label: 'Time', type: 'date-range' },
            'sex': { label: 'Gender', type: 'select', options: [{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }] },
            'age_estimate': { label: 'Age Group', type: 'select', options: [
                { value: '(0,8)', label: '0-8 years' },
                { value: '(9,16)', label: '9-16 years' },
                { value: '(17,25)', label: '17-25 years' },
                { value: '(25,40)', label: '25-40 years' },
                { value: '(40,60)', label: '40-60 years' },
                { value: '(60+)', label: '60+ years' }
            ]},
            'event': { label: 'Event Type', type: 'select', options: [{ value: 'entry', label: 'Entry' }, { value: 'exit', label: 'Exit' }] },
            'hour': { label: 'Hour', type: 'number-range' },
            'day_of_week': { label: 'Day of Week', type: 'select', options: [
                { value: 'Monday', label: 'Monday' },
                { value: 'Tuesday', label: 'Tuesday' },
                { value: 'Wednesday', label: 'Wednesday' },
                { value: 'Thursday', label: 'Thursday' },
                { value: 'Friday', label: 'Friday' },
                { value: 'Saturday', label: 'Saturday' },
                { value: 'Sunday', label: 'Sunday' }
            ]}
        };
        this.collapsed = false;
        this.eventsInitialized = false;
        this.conditionChangeHandler = null;
        this.conditionInputHandler = null;
        this.clickHandler = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.addDefaultCondition();
        this.render();
    }

    bindEvents() {
        // Apply filters button
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.applyFilters();
        });

        // Collapse/expand toggle
        document.getElementById('collapseFilters').addEventListener('click', () => {
            this.toggleCollapse();
        });

        // Add condition group
        document.getElementById('addConditionGroup').addEventListener('click', () => {
            this.addConditionGroup();
        });

        // Create bound click handler to avoid duplicates
        this.clickHandler = (e) => {
            if (e.target.matches('.add-condition')) {
                const groupIndex = e.target.dataset.group === 'primary' ? 0 : 1;
                this.addCondition(groupIndex);
            } else if (e.target.matches('.remove-condition')) {
                const groupIndex = parseInt(e.target.dataset.group);
                const conditionIndex = parseInt(e.target.dataset.condition);
                this.removeCondition(groupIndex, conditionIndex);
            } else if (e.target.matches('.group-toggle') || e.target.closest('.group-toggle')) {
                this.toggleGroup(e);
            }
        };

        // Bind click handler once
        document.addEventListener('click', this.clickHandler);
    }

    addDefaultCondition() {
        this.conditionGroups[0].conditions.push({
            field: 'timestamp',
            operator: 'between',
            value: '',
            value2: ''
        });
    }

    addCondition(groupIndex = 0) {
        this.conditionGroups[groupIndex].conditions.push({
            field: 'sex',
            operator: 'equals',
            value: ''
        });
        this.render();
    }

    removeCondition(groupIndex, conditionIndex) {
        this.conditionGroups[groupIndex].conditions.splice(conditionIndex, 1);
        this.render();
    }

    addConditionGroup() {
        if (this.conditionGroups.length < 2) {
            this.conditionGroups.push({ logic: 'OR', conditions: [] });
            document.querySelector('.secondary-group').style.display = 'block';
            this.render();
        }
    }

    toggleCollapse() {
        this.collapsed = !this.collapsed;
        const content = document.getElementById('filterBuilderContent');
        const button = document.getElementById('collapseFilters');
        
        if (this.collapsed) {
            content.style.display = 'none';
            button.innerHTML = '<i class="expand-icon"></i> Expand';
        } else {
            content.style.display = 'block';
            button.innerHTML = '<i class="collapse-icon"></i> Collapse';
        }
    }

    renderCondition(condition, groupIndex, conditionIndex) {
        const fieldConfig = this.conditionTypes[condition.field];
        let operatorOptions = '';
        let valueInputs = '';

        // Generate operator options based on field type
        if (fieldConfig.type === 'select') {
            operatorOptions = `
                <option value="equals" ${condition.operator === 'equals' ? 'selected' : ''}>is</option>
                <option value="not_equals" ${condition.operator === 'not_equals' ? 'selected' : ''}>is not</option>
            `;
        } else if (fieldConfig.type === 'date-range') {
            operatorOptions = `
                <option value="between" ${condition.operator === 'between' ? 'selected' : ''}>is between</option>
                <option value="after" ${condition.operator === 'after' ? 'selected' : ''}>is after</option>
                <option value="before" ${condition.operator === 'before' ? 'selected' : ''}>is before</option>
            `;
        } else if (fieldConfig.type === 'number-range') {
            operatorOptions = `
                <option value="equals" ${condition.operator === 'equals' ? 'selected' : ''}>equals</option>
                <option value="between" ${condition.operator === 'between' ? 'selected' : ''}>is between</option>
                <option value="greater" ${condition.operator === 'greater' ? 'selected' : ''}>greater than</option>
                <option value="less" ${condition.operator === 'less' ? 'selected' : ''}>less than</option>
            `;
        }

        // Generate value inputs based on field type and operator
        if (fieldConfig.type === 'select') {
            const options = fieldConfig.options.map(opt => 
                `<option value="${opt.value}" ${condition.value === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            valueInputs = `<select class="form-select condition-value" data-group="${groupIndex}" data-condition="${conditionIndex}">
                <option value="">Select...</option>${options}</select>`;
        } else if (fieldConfig.type === 'date-range') {
            if (condition.operator === 'between') {
                valueInputs = `
                    <input type="date" class="form-control condition-value" data-group="${groupIndex}" data-condition="${conditionIndex}" value="${condition.value || ''}">
                    <span class="range-separator">and</span>
                    <input type="date" class="form-control condition-value2" data-group="${groupIndex}" data-condition="${conditionIndex}" value="${condition.value2 || ''}">
                `;
            } else {
                valueInputs = `<input type="date" class="form-control condition-value" data-group="${groupIndex}" data-condition="${conditionIndex}" value="${condition.value || ''}">`;
            }
        } else if (fieldConfig.type === 'number-range') {
            if (condition.operator === 'between') {
                valueInputs = `
                    <input type="number" class="form-control condition-value" data-group="${groupIndex}" data-condition="${conditionIndex}" value="${condition.value || ''}" min="0" max="23">
                    <span class="range-separator">and</span>
                    <input type="number" class="form-control condition-value2" data-group="${groupIndex}" data-condition="${conditionIndex}" value="${condition.value2 || ''}" min="0" max="23">
                `;
            } else {
                valueInputs = `<input type="number" class="form-control condition-value" data-group="${groupIndex}" data-condition="${conditionIndex}" value="${condition.value || ''}" min="0" max="23">`;
            }
        }

        return `
            <div class="condition-row" data-group="${groupIndex}" data-condition="${conditionIndex}">
                <div class="condition-logic">${conditionIndex > 0 ? 'AND' : 'WHERE'}</div>
                <select class="form-select condition-field" data-group="${groupIndex}" data-condition="${conditionIndex}">
                    ${Object.entries(this.conditionTypes).map(([key, config]) => 
                        `<option value="${key}" ${condition.field === key ? 'selected' : ''}>${config.label}</option>`
                    ).join('')}
                </select>
                <select class="form-select condition-operator" data-group="${groupIndex}" data-condition="${conditionIndex}">
                    ${operatorOptions}
                </select>
                <div class="condition-values">
                    ${valueInputs}
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger remove-condition" data-group="${groupIndex}" data-condition="${conditionIndex}">
                    <i class="delete-icon"></i>
                </button>
            </div>
        `;
    }

    render() {
        // Render primary conditions
        const primaryContainer = document.getElementById('primaryConditions');
        if (primaryContainer) {
            primaryContainer.innerHTML = this.conditionGroups[0].conditions
                .map((condition, index) => this.renderCondition(condition, 0, index))
                .join('');
        }

        // Render secondary conditions if they exist
        if (this.conditionGroups.length > 1) {
            const secondaryContainer = document.getElementById('secondaryConditions');
            if (secondaryContainer) {
                secondaryContainer.innerHTML = this.conditionGroups[1].conditions
                    .map((condition, index) => this.renderCondition(condition, 1, index))
                    .join('');
            }
        }

        // Only bind events once during initialization
        if (!this.eventsInitialized) {
            this.bindConditionEvents();
            this.eventsInitialized = true;
        }
    }

    toggleGroup(e) {
        e.preventDefault();
        const groupElement = e.target.closest('.condition-group');
        const conditionsContainer = groupElement.querySelector('.conditions-container');
        const addButton = groupElement.querySelector('.add-condition');
        const toggleIcon = e.target.querySelector('.toggle-icon') || e.target.closest('.group-toggle').querySelector('.toggle-icon');
        
        if (conditionsContainer.style.display === 'none') {
            conditionsContainer.style.display = 'block';
            addButton.style.display = 'block';
            toggleIcon.style.transform = 'rotate(0deg)';
        } else {
            conditionsContainer.style.display = 'none';
            addButton.style.display = 'none';
            toggleIcon.style.transform = 'rotate(-90deg)';
        }
    }

    bindConditionEvents() {
        // Remove existing listeners to prevent duplicates
        if (this.conditionChangeHandler) {
            document.removeEventListener('change', this.conditionChangeHandler);
        }
        if (this.conditionInputHandler) {
            document.removeEventListener('input', this.conditionInputHandler);
        }

        // Create bound handlers to avoid duplicates
        this.conditionChangeHandler = (e) => {
            if (e.target.matches('.condition-field')) {
                const groupIndex = parseInt(e.target.dataset.group);
                const conditionIndex = parseInt(e.target.dataset.condition);
                this.conditionGroups[groupIndex].conditions[conditionIndex].field = e.target.value;
                this.conditionGroups[groupIndex].conditions[conditionIndex].operator = 'equals';
                this.render();
            } else if (e.target.matches('.condition-operator')) {
                const groupIndex = parseInt(e.target.dataset.group);
                const conditionIndex = parseInt(e.target.dataset.condition);
                this.conditionGroups[groupIndex].conditions[conditionIndex].operator = e.target.value;
                this.render();
            }
        };

        this.conditionInputHandler = (e) => {
            if (e.target.matches('.condition-value')) {
                const groupIndex = parseInt(e.target.dataset.group);
                const conditionIndex = parseInt(e.target.dataset.condition);
                this.conditionGroups[groupIndex].conditions[conditionIndex].value = e.target.value;
            } else if (e.target.matches('.condition-value2')) {
                const groupIndex = parseInt(e.target.dataset.group);
                const conditionIndex = parseInt(e.target.dataset.condition);
                this.conditionGroups[groupIndex].conditions[conditionIndex].value2 = e.target.value;
            }
        };

        // Bind the handlers once
        document.addEventListener('change', this.conditionChangeHandler);
        document.addEventListener('input', this.conditionInputHandler);
    }

    applyFilters() {
        const filterData = this.buildFilterQuery();
        console.log('Applying filters:', filterData);
        loadDashboardData(filterData);
    }

    buildFilterQuery() {
        const query = {};
        
        // Process primary AND conditions
        this.conditionGroups[0].conditions.forEach(condition => {
            if (condition.value) {
                if (condition.field === 'timestamp' && condition.operator === 'between') {
                    if (condition.value) query.start_date = condition.value;
                    if (condition.value2) query.end_date = condition.value2;
                } else if (condition.field === 'sex') {
                    query.gender = condition.value;
                } else if (condition.field === 'age_estimate') {
                    query.age_group = condition.value;
                }
                // Add more field mappings as needed
            }
        });

        return query;
    }
}

function initializeFilterBuilder() {
    // Temporarily disabled - will re-enable after charts work
    console.log('FilterBuilder initialization skipped for debugging');
}

function setupEventListeners() {
    // CSV upload functionality (if upload area exists)
    const uploadArea = document.getElementById('uploadArea');
    const csvUpload = document.getElementById('csvUpload');

    if (uploadArea && csvUpload) {
        uploadArea.addEventListener('click', () => csvUpload.click());
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('drop', handleDrop);
        csvUpload.addEventListener('change', handleFileSelect);
    }

    // Tab switching
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(e) {
            // Refresh charts when tab is shown
            setTimeout(refreshVisibleCharts, 100);
        });
    });
}

function loadDashboardData(filterParams = {}) {
    showLoading();
    
    const params = new URLSearchParams(filterParams);
    
    fetch('/api/chart-data?' + params.toString())
        .then(response => {
            console.log('API response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('API response data:', data);
            if (data.error) {
                console.error('API returned error:', data.error);
                showError(data.error);
                return;
            }
            currentData = data;
            console.log('About to call generateAllCharts...');
            generateAllCharts();
        })
        .catch(error => {
            console.error('Error loading data:', error);
            showError('Failed to load dashboard data: ' + error.message);
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
    console.log('generateAllCharts called with data:', currentData);
    if (!currentData || !currentData.data) {
        console.error('No data available for charts');
        showError('No data available');
        return;
    }

    const data = currentData.data;
    console.log('Processing', data.length, 'data records for charts');
    
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
    try {
        const currentHour = new Date().getHours();
        const currentData = data.filter(d => {
            if (!d.timestamp) return false;
            const hour = new Date(d.timestamp).getHours();
            return !isNaN(hour) && hour === currentHour;
        });
        
        const occupancyData = [{
            x: ['Current Hour'],
            y: [currentData.length],
            type: 'bar',
            marker: { color: '#0d6efd' }
        }];
        
        const layout = {
            title: `Live Occupancy (${data.length} total records)`,
            xaxis: { title: 'Time Period' },
            yaxis: { title: 'Number of People' },
            margin: { t: 40, b: 40, l: 60, r: 20 }
        };
        
        Plotly.newPlot('liveOccupancy', occupancyData, layout, {responsive: true});
        chartInstances['liveOccupancy'] = { data: occupancyData, layout: layout };
    } catch (error) {
        console.error('Error in generateLiveOccupancy:', error);
        document.getElementById('liveOccupancy').innerHTML = '<div class="alert alert-danger">Chart error: ' + error.message + '</div>';
    }
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