    // --- Globals & Initial Setup ---
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('data:text/javascript;base64,dmFyIGN1cnJlbnRfdmVyc2lvbiA9ICcxJzs=')
        .then(reg => console.log('Service worker registered.'))
        .catch(err => console.log('Service worker not registered.', err));
    }
    lucide.createIcons();

    let students = JSON.parse(localStorage.getItem('students')) || [];
    let attendanceRecords = JSON.parse(localStorage.getItem('attendance')) || [];
    let attendanceChartInstance = null;
    let currentReportData = {}; // UPDATED: Store structured data for the report

    const tabs = document.querySelectorAll('.tab-button');
    const sections = document.querySelectorAll('section');

    // --- Tab Navigation ---
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.replace('bg-blue-500', 'bg-gray-300') || t.classList.replace('text-white', 'text-gray-700'));
        tab.classList.replace('bg-gray-300', 'bg-blue-500');
        tab.classList.replace('text-gray-700', 'text-white');
        sections.forEach(section => section.classList.add('hidden'));
        document.getElementById(tab.id.replace('-tab', '-section')).classList.remove('hidden');
      });
    });

    // --- Core Data Rendering Functions ---
    function loadData() {
      renderAttendance();
      renderStudents();
      updateReportsDashboard();
    }

    function renderAttendance(filterDate = '', searchTerm = '') {
      const tbody = document.getElementById('attendance-body');
      tbody.innerHTML = '';
      const filteredRecords = attendanceRecords.filter(record => {
        const recordDate = new Date(record.date);
        const filterDateObj = filterDate ? new Date(filterDate) : null;
        if(filterDateObj) filterDateObj.setMinutes(filterDateObj.getMinutes() + filterDateObj.getTimezoneOffset());
        const matchesDate = !filterDate || recordDate.toDateString() === filterDateObj.toDateString();
        const matchesSearch = !searchTerm || record.studentId.toLowerCase().includes(searchTerm.toLowerCase()) || record.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesDate && matchesSearch;
      }).sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
      filteredRecords.forEach(record => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="px-4 py-3 border-b">${record.studentId}</td><td class="px-4 py-3 border-b">${record.name}</td><td class="px-4 py-3 border-b">${new Date(record.date).toLocaleDateString()}</td><td class="px-4 py-3 border-b">${record.time}</td>`;
        tbody.appendChild(tr);
      });
    }

    function renderStudents() {
      const grid = document.getElementById('students-grid');
      grid.innerHTML = '';
      students.forEach(student => {
        const card = document.createElement('div');
        card.className = 'bg-gray-50 p-4 rounded-lg shadow-md student-card-print';
        card.innerHTML = `<div class="mb-4 flex justify-center"><canvas id="qr-${student.id}"></canvas></div><h3 class="text-lg font-semibold text-gray-800 text-center">${student.name}</h3><p class="text-gray-600 text-center">ID: ${student.id}</p><div class="flex justify-center mt-2 no-print"><button onclick="deleteStudent('${student.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">Delete</button></div>`;
        grid.appendChild(card);
        setTimeout(() => {
          const canvas = document.getElementById(`qr-${student.id}`);
          if (canvas && window.QRCode) QRCode.toCanvas(canvas, student.id, { width: 150, height: 150, margin: 1 }, (error) => { if (error) console.error(error); });
        }, 50);
      });
    }

    function updateReportsDashboard() {
      document.getElementById('total-students').textContent = students.length;
      const today = new Date().toDateString();
      const presentIds = new Set(attendanceRecords.filter(r => new Date(r.date).toDateString() === today).map(r => r.studentId));
      const presentToday = presentIds.size;
      const absentToday = students.length - presentToday;
      document.getElementById('present-today').textContent = presentToday;
      document.getElementById('absent-today').textContent = absentToday > 0 ? absentToday : 0;
      renderAttendanceChart();
    }

    // --- Chart Rendering ---
    function renderAttendanceChart() {
        const ctx = document.getElementById('attendance-chart').getContext('2d');
        const labels = [];
        const data = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateString = d.toDateString();
            labels.push(d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
            const presentCount = new Set(attendanceRecords.filter(r => new Date(r.date).toDateString() === dateString).map(r => r.studentId)).size;
            data.push(presentCount);
        }
        if (attendanceChartInstance) attendanceChartInstance.destroy();
        attendanceChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Present Students',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                responsive: true,
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- Student Management ---
    document.getElementById('add-student-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('student-id').value.trim();
      const name = document.getElementById('student-name').value.trim();
      if (!id || !name) return alert('Student ID and Name cannot be empty.');
      if (students.find(s => s.id === id)) return alert('Student ID already exists!');
      students.push({ id, name });
      localStorage.setItem('students', JSON.stringify(students));
      loadData();
      e.target.reset();
    });

    function deleteStudent(id) {
      if (confirm(`Are you sure you want to delete student ID: ${id}? This will also remove all their attendance records.`)) {
        students = students.filter(s => s.id !== id);
        localStorage.setItem('students', JSON.stringify(students));
        attendanceRecords = attendanceRecords.filter(r => r.studentId !== id);
        localStorage.setItem('attendance', JSON.stringify(attendanceRecords));
        loadData();
      }
    }
    
    // --- QR Scanner ---
    const qrScannerModal = document.getElementById('qr-scanner-modal');
    const scanMessage = document.getElementById('scan-message');
    let html5QrCode;

    function onScanSuccess(decodedText, decodedResult) {
      html5QrCode.pause();
      handleQrCodeScanned(decodedText);
    }

    document.getElementById('open-scanner-btn').addEventListener('click', () => {
      if (students.length === 0) return alert('No students registered! Please add students first.');
      qrScannerModal.classList.remove('hidden');
      scanMessage.textContent = 'Initializing camera...';
      if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");
      html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, (err) => {})
        .catch(err => scanMessage.textContent = `Error starting camera: ${err}`);
    });

    document.getElementById('close-scanner').addEventListener('click', () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => qrScannerModal.classList.add('hidden')).catch(err => console.error(err));
      } else {
        qrScannerModal.classList.add('hidden');
      }
    });

    function handleQrCodeScanned(scannedText) {
      const student = students.find(s => s.id === scannedText.trim());
      if (!student) {
        scanMessage.innerHTML = `<span class="text-red-500">Student not found.</span>`;
      } else {
        const today = new Date().toDateString();
        const alreadyMarked = attendanceRecords.some(r => r.studentId === student.id && new Date(r.date).toDateString() === today);
        if (alreadyMarked) {
          scanMessage.innerHTML = `<span class="text-yellow-500">Attendance already marked for ${student.name}.</span>`;
        } else {
          attendanceRecords.push({ studentId: student.id, name: student.name, date: new Date().toDateString(), time: new Date().toLocaleTimeString() });
          localStorage.setItem('attendance', JSON.stringify(attendanceRecords));
          loadData();
          scanMessage.innerHTML = `<span class="text-green-500">Success! Marked attendance for ${student.name}.</span>`;
        }
      }
      setTimeout(() => {
        scanMessage.textContent = '';
        if (html5QrCode && !html5QrCode.isScanning) html5QrCode.resume();
      }, 2000);
    }
    
    // --- Filters & Reports ---
    document.getElementById('date-filter').addEventListener('input', () => renderAttendance(document.getElementById('date-filter').value, document.getElementById('search-input').value.trim()));
    document.getElementById('search-input').addEventListener('input', () => renderAttendance(document.getElementById('date-filter').value, document.getElementById('search-input').value.trim()));
    document.getElementById('clear-filters').addEventListener('click', () => {
      document.getElementById('date-filter').value = '';
      document.getElementById('search-input').value = '';
      renderAttendance();
    });

    // UPDATED: Report generation logic
    document.getElementById('generate-report').addEventListener('click', () => {
      const selectedDateValue = document.getElementById('report-date').value;
      if (!selectedDateValue) return alert('Please select a date!');
      
      const selectedDate = new Date(selectedDateValue);
      selectedDate.setMinutes(selectedDate.getMinutes() + selectedDate.getTimezoneOffset());
      const selectedDateString = selectedDate.toDateString();

      const presentIds = new Set(attendanceRecords.filter(r => new Date(r.date).toDateString() === selectedDateString).map(r => r.studentId));
      
      // Store structured data for CSV export
      currentReportData = {
          date: selectedDateString,
          total: students.length,
          present: presentIds.size,
          absent: students.length - presentIds.size,
          details: students.map(s => ({
              id: s.id,
              name: s.name,
              status: presentIds.has(s.id) ? 'Present' : 'Absent'
          }))
      };

      // Generate text for display
      let displayText = `Attendance Report for: ${currentReportData.date}\n\n--- Summary ---\nTotal Students: ${currentReportData.total}\nPresent: ${currentReportData.present}\nAbsent: ${currentReportData.absent}\n\n--- Student Details ---\n${currentReportData.details.map(s => `- ${s.name} (Status: ${s.status})`).join('\n')}`;
      
      document.getElementById('report-text').textContent = displayText;
      document.getElementById('detailed-report').classList.remove('hidden');
      document.getElementById('download-report-btn').classList.remove('hidden');
    });
    
    // --- Data Management (Import/Export/Print) ---
    function exportToCSV(data, filename) {
        if (data.length === 0) return alert("No data to export.");
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(','), ...data.map(row => headers.map(header => JSON.stringify(row[header])).join(','))];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    document.getElementById('export-csv-btn').addEventListener('click', () => exportToCSV(students, 'student_list.csv'));
    document.getElementById('export-attendance-btn').addEventListener('click', () => exportToCSV(attendanceRecords, 'all_attendance_records.csv'));
    document.getElementById('import-csv-btn').addEventListener('click', () => document.getElementById('csv-file-input').click());
    document.getElementById('print-cards-btn').addEventListener('click', () => window.print());

    document.getElementById('csv-file-input').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const rows = e.target.result.split('\n').slice(1);
            let importedCount = 0;
            rows.forEach(row => {
                const [id, name] = row.split(',').map(s => s.trim());
                if (id && name && !students.find(s => s.id === id)) {
                    students.push({ id, name });
                    importedCount++;
                }
            });
            localStorage.setItem('students', JSON.stringify(students));
            alert(`${importedCount} new students imported successfully!`);
            loadData();
        };
        reader.readAsText(file);
        event.target.value = '';
    });
    
    // UPDATED: Download report as CSV
    document.getElementById('download-report-btn').addEventListener('click', () => {
        if (!currentReportData.details) return alert('Please generate a report first.');
        
        // Build CSV content
        let csvContent = "Attendance Report\n";
        csvContent += `Date,"${currentReportData.date}"\n\n`;
        csvContent += "Summary\n";
        csvContent += `Metric,Value\n`;
        csvContent += `Total Students,${currentReportData.total}\n`;
        csvContent += `Present,${currentReportData.present}\n`;
        csvContent += `Absent,${currentReportData.absent}\n\n`;
        csvContent += "Student Details\n";
        csvContent += "ID,Name,Status\n";
        
        currentReportData.details.forEach(student => {
            csvContent += `"${student.id}","${student.name}","${student.status}"\n`;
        });

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const selectedDate = document.getElementById('report-date').value;
        a.setAttribute('href', url);
        a.setAttribute('download', `Attendance_Report_${selectedDate}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // --- Initial Load ---
    loadData();