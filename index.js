async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ImageScalingDB", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("original");

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (file) {
      const processingOverlay = document.getElementById("processingOverlay");
      processingOverlay.style.display = "flex";

      try {
        if (localStorage.getItem("ImageScalingDB") !== null)
          indexedDB.deleteDatabase("ImageScalingDB");
        const db = await openDB();
        const timestamp = Date.now();
        localStorage.setItem("ImageScalingDB", timestamp);

        const originalTransaction = db.transaction(["images"], "readwrite");
        const originalStore = originalTransaction.objectStore("images");

        await new Promise((resolve, reject) => {
          const request = originalStore.add({
            data: file,
            type: file.type,
            scaleFactor: 1.0,
            method: "original",
          });
          request.onsuccess = resolve;
          request.onerror = (event) => reject(event.target.error);
        });

        processWithWorkers(file, db);
      } catch (error) {
        console.error("Error processing images", error);
        alert("Failed to process images");
        processingOverlay.style.display = "none";
      }
    }
  });
});

function processWithWorkers(file, db) {
  const scalingMethods = ["nearest", "bilinear", "bicubic", "lanczos"];
  const scaleFactors = [0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.0];
  const maxWorkers = Math.min(navigator.hardwareConcurrency || 2, 8);

  // Create a queue of tasks instead of processing all at once
  const taskQueue = [];
  for (const scaleFactor of scaleFactors) {
    for (const interpolationMethod of scalingMethods) {
      taskQueue.push({ scaleFactor, interpolationMethod });
    }
  }

  // Improved worker pool management
  class WorkerPool {
    constructor(maxWorkers, workerScript) {
      this.maxWorkers = maxWorkers;
      this.workerScript = workerScript;
      this.workers = [];
      this.activeWorkers = 0;
      this.completedTasks = 0;
      this.totalTasks = taskQueue.length;
      this.taskQueue = taskQueue;
      this.imageDataRaw = null;
      this.db = db;
    }

    createWorker() {
      const worker = new Worker(this.workerScript);
      worker.onmessage = this.handleWorkerMessage.bind(this, worker);
      worker.onerror = this.handleWorkerError.bind(this, worker);
      return worker;
    }

    start(imageDataRaw) {
      this.imageDataRaw = imageDataRaw;
      this.processNextTask();
    }

    processNextTask() {
      // If no more tasks or max workers reached, return
      if (
        this.taskQueue.length === 0 ||
        this.activeWorkers >= this.maxWorkers
      ) {
        return;
      }

      const task = this.taskQueue.shift();
      const worker = this.createWorker();
      this.workers.push(worker);
      this.activeWorkers++;

      // Send task to worker
      worker.postMessage({
        imageData: this.imageDataRaw,
        width: Math.round(this.imageDataRaw.width * task.scaleFactor),
        height: Math.round(this.imageDataRaw.height * task.scaleFactor),
        scaleFactor: task.scaleFactor,
        interpolationMethod: task.interpolationMethod,
        type: file.type,
      });
    }

    async handleWorkerMessage(worker, event) {
      const scaledImage = event.data.scaledBlob;

      try {
        if (scaledImage) {
          const transaction = this.db.transaction(["images"], "readwrite");
          const store = transaction.objectStore("images");

          await new Promise((resolve, reject) => {
            const request = store.add({
              data: scaledImage.blob,
              method: scaledImage.method,
              scaleFactor: scaledImage.scaleFactor,
              processingTime: scaledImage.processingTime,
              psnr: scaledImage.psnr,
              fsim: scaledImage.fsim,
              ssim: scaledImage.ssim,
            });
            request.onsuccess = resolve;
            request.onerror = (event) => reject(event.target.error);
          });
        }
      } catch (storeError) {
        console.error("Error storing scaled image", storeError);
      }

      // Clean up and process next task
      this.activeWorkers--;
      this.completedTasks++;
      worker.terminate();

      // If all tasks completed, redirect or perform final action
      if (this.completedTasks === this.totalTasks) {
        window.location.href = "display.html";
      }

      // Process next task from the queue
      this.processNextTask();
    }

    handleWorkerError(worker, error) {
      console.error("Worker error:", error);
      this.activeWorkers--;
      this.completedTasks++;
      worker.terminate();

      // If all tasks completed, redirect or perform final action
      if (this.completedTasks === this.totalTasks) {
        window.location.href = "display.html";
      }

      // Process next task from the queue
      this.processNextTask();
    }
  }

  // Image loading and processing
  const img = new Image();
  img.onload = () => {
    const offscreenCanvas = new OffscreenCanvas(img.width, img.height);
    const ctx = offscreenCanvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageDataRaw = ctx.getImageData(0, 0, img.width, img.height);

    // Initialize and start worker pool
    const workerPool = new WorkerPool(maxWorkers, "scalingWorker.js");
    workerPool.start(imageDataRaw);
  };

  img.src = URL.createObjectURL(file);
}
