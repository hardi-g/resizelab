async function getMetricsFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const dbName = "ImageScalingDB";
    const request = indexedDB.open(dbName, 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["images"], "readonly");
      const store = transaction.objectStore("images");
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = (event) => {
        const metrics = event.target.result;
        resolve(metrics);
      };

      getAllRequest.onerror = (event) => {
        console.error(
          "Error fetching metrics from IndexedDB:",
          event.target.error,
        );
        reject("Error fetching metrics from IndexedDB");
      };
    };

    request.onupgradeneeded = (event) => {
      console.warn(
        "Upgrade needed: Ensure that IndexedDB is properly initialized",
      );
    };

    request.onerror = (event) => {
      console.error("Error opening IndexedDB:", event.target.error);
      reject("Error opening IndexedDB");
    };
  });
}

const algorithmColors = {
  nearest: "rgb(255, 99, 132)", // Red
  bilinear: "rgb(54, 162, 235)", // Blue
  bicubic: "rgb(255, 206, 86)", // Yellow
  lanczos: "rgb(75, 192, 192)", // Green
};

// Function to prepare chart data
function prepareChartData(metrics) {
  // Group metrics by interpolation method and scale factor
  const groupedMetrics = {};

  metrics.forEach((metric) => {
    const method = metric.method.toLowerCase();
    if (!groupedMetrics[method]) {
      groupedMetrics[method] = [];
    }
    groupedMetrics[method].push(metric);
  });

  // Ensure consistent scale factors across all methods
  const scaleFactors = [0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2];

  return {
    scaleFactors,
    psnrDatasets: scaleFactors.map((factor) => ({
      nearest:
        groupedMetrics["nearest"]?.find((m) => m.scaleFactor === factor)
          ?.psnr || null,
      bilinear:
        groupedMetrics["bilinear"]?.find((m) => m.scaleFactor === factor)
          ?.psnr || null,
      bicubic:
        groupedMetrics["bicubic"]?.find((m) => m.scaleFactor === factor)
          ?.psnr || null,
      lanczos:
        groupedMetrics["lanczos"]?.find((m) => m.scaleFactor === factor)
          ?.psnr || null,
    })),
    fsimDatasets: scaleFactors.map((factor) => ({
      nearest:
        groupedMetrics["nearest"]?.find((m) => m.scaleFactor === factor)
          ?.fsim || null,
      bilinear:
        groupedMetrics["bilinear"]?.find((m) => m.scaleFactor === factor)
          ?.fsim || null,
      bicubic:
        groupedMetrics["bicubic"]?.find((m) => m.scaleFactor === factor)
          ?.fsim || null,
      lanczos:
        groupedMetrics["lanczos"]?.find((m) => m.scaleFactor === factor)
          ?.fsim || null,
    })),
    timeDatasets: scaleFactors.map((factor) => ({
      nearest:
        groupedMetrics["nearest"]?.find((m) => m.scaleFactor === factor)
          ?.processingTime || null,
      bilinear:
        groupedMetrics["bilinear"]?.find((m) => m.scaleFactor === factor)
          ?.processingTime || null,
      bicubic:
        groupedMetrics["bicubic"]?.find((m) => m.scaleFactor === factor)
          ?.processingTime || null,
      lanczos:
        groupedMetrics["lanczos"]?.find((m) => m.scaleFactor === factor)
          ?.processingTime || null,
    })),
    ssimDatasets: scaleFactors.map((factor) => ({
      nearest:
        groupedMetrics["nearest"]?.find((m) => m.scaleFactor === factor)
          ?.ssim || null,
      bilinear:
        groupedMetrics["bilinear"]?.find((m) => m.scaleFactor === factor)
          ?.ssim || null,
      bicubic:
        groupedMetrics["bicubic"]?.find((m) => m.scaleFactor === factor)
          ?.ssim || null,
      lanczos:
        groupedMetrics["lanczos"]?.find((m) => m.scaleFactor === factor)
          ?.ssim || null,
    })),
  };
}

// Function to create comparison charts
async function createComparisonCharts() {
  try {
    // Retrieve metrics from IndexedDB
    const metrics = await getMetricsFromIndexedDB();

    // Prepare chart data
    const {
      scaleFactors,
      psnrDatasets,
      fsimDatasets,
      timeDatasets,
      ssimDatasets,
    } = prepareChartData(metrics);

    // Common chart configuration
    const chartConfig = {
      type: "line",
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: "Interpolation Algorithms Comparison",
          },
          tooltip: {
            mode: "index",
            intersect: false,
          },
          legend: {
            position: "bottom",
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Scale Factor",
            },
          },
        },
      },
    };

    // Function to create a chart
    function createComparisonChart(canvasId, datasets, yAxisLabel, title) {
      const ctx = document.getElementById(canvasId)?.getContext("2d");

      return new Chart(ctx, {
        ...chartConfig,
        data: {
          labels: scaleFactors,
          datasets: [
            {
              label: "Nearest Neighbor",
              data: datasets.map((d) => d.nearest),
              borderColor: algorithmColors.nearest,
              tension: 0.1,
            },
            {
              label: "Bilinear",
              data: datasets.map((d) => d.bilinear),
              borderColor: algorithmColors.bilinear,
              tension: 0.1,
            },
            {
              label: "Bicubic",
              data: datasets.map((d) => d.bicubic),
              borderColor: algorithmColors.bicubic,
              tension: 0.1,
            },
            {
              label: "Lanczos",
              data: datasets.map((d) => d.lanczos),
              borderColor: algorithmColors.lanczos,
              tension: 0.1,
            },
          ],
        },
        options: {
          ...chartConfig.options,
          plugins: {
            ...chartConfig.options.plugins,
            title: {
              display: true,
              text: title,
            },
          },
          scales: {
            ...chartConfig.options.scales,
            y: {
              title: {
                display: true,
                text: yAxisLabel,
              },
            },
          },
        },
      });
    }

    // Create individual charts
    createComparisonChart(
      "psnrChart",
      psnrDatasets,
      "PSNR (dB)",
      "PSNR Comparison",
    );
    createComparisonChart(
      "fsimChart",
      fsimDatasets,
      "FSIM Score",
      "FSIM Comparison",
    );
    createComparisonChart(
      "timeChart",
      timeDatasets,
      "Processing Time (ms)",
      "Processing Time Comparison",
    );
    createComparisonChart(
      "ssimChart",
      ssimDatasets,
      "SSIM Score",
      "SSIM Comparison",
    );
  } catch (error) {
    console.error("Error creating charts:", error);
  }
}
