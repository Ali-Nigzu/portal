import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Papa from 'papaparse';

// PNG Export - captures chart visualization
export const exportChartAsPNG = async (chartElementId: string, filename: string = 'chart') => {
  try {
    const element = document.getElementById(chartElementId);
    if (!element) {
      throw new Error('Chart element not found');
    }

    const canvas = await html2canvas(element, {
      backgroundColor: '#1a1a1a', // VRM dark background
      scale: 2, // Higher resolution
      logging: false,
      useCORS: true,
      allowTaint: true
    });

    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (error) {
    console.error('Error exporting PNG:', error);
    alert('Failed to export chart as PNG');
  }
};

// CSV Export - exports only the filtered data being viewed
export const exportDataAsCSV = (data: any[], filename: string = 'data', columns?: string[]) => {
  try {
    // If specific columns are provided, filter the data
    const exportData = columns ? 
      data.map(row => {
        const filteredRow: any = {};
        columns.forEach(col => {
          filteredRow[col] = row[col];
        });
        return filteredRow;
      }) : data;

    const csv = Papa.unparse(exportData, {
      header: true,
      delimiter: ',',
      quotes: true
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    console.error('Error exporting CSV:', error);
    alert('Failed to export data as CSV');
  }
};

// PDF Export - converts chart to PDF format
export const exportChartAsPDF = async (chartElementId: string, filename: string = 'chart') => {
  try {
    const element = document.getElementById(chartElementId);
    if (!element) {
      throw new Error('Chart element not found');
    }

    const canvas = await html2canvas(element, {
      backgroundColor: '#1a1a1a',
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const imgWidth = 297; // A4 landscape width in mm
    const pageHeight = 210; // A4 landscape height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    alert('Failed to export chart as PDF');
  }
};

// Generate unique chart ID
export const generateChartId = (baseName: string) => {
  return `chart-${baseName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
};