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

async function scaleImageWithOpenCV(
  imageData,
  scaleFactor,
  interpolationMethod,
) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageData);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const imageDataRaw = ctx.getImageData(0, 0, img.width, img.height);
      const mat = cv.matFromImageData(imageDataRaw);

      let interpolationFlag;
      switch (interpolationMethod) {
        case "nearest":
          interpolationFlag = cv.INTER_NEAREST;
          break;
        case "bilinear":
          interpolationFlag = cv.INTER_LINEAR;
          break;
        case "bicubic":
          interpolationFlag = cv.INTER_CUBIC;
          break;
        case "lanczos":
          interpolationFlag = cv.INTER_LANCZOS4;
          break;
        default:
          interpolationFlag = cv.INTER_LINEAR;
      }

      const newWidth = Math.round(img.width * scaleFactor);
      const newHeight = Math.round(img.height * scaleFactor);

      const dsize = new cv.Size(newWidth, newHeight);
      const dst = new cv.Mat();

      const startTime = performance.now();
      cv.resize(mat, dst, dsize, 0, 0, interpolationFlag);
      const endTime = performance.now();
      const processingTime = (endTime - startTime).toFixed(2);

      const resizedCanvas = document.createElement("canvas");
      resizedCanvas.width = newWidth;
      resizedCanvas.height = newHeight;
      const resizedCtx = resizedCanvas.getContext("2d");
      const resizedImageData = new ImageData(
        new Uint8ClampedArray(dst.data),
        newWidth,
        newHeight,
      );
      resizedCtx.putImageData(resizedImageData, 0, 0);

      // const originalCanvas = canvas;
      // const psnr = calculatePSNR(originalCanvas, resizedCanvas);

      const psnr = calculatePSNR(canvas, resizedCanvas);
      console.log("PSNR Value:", psnr);

      const fsim = processImages(canvas, resizedCanvas);
      console.log("FSIM Value", fsim);

      console.log("PSNR Value", psnr);

      const ssim = calculateSSIM(canvas, resizedCanvas);
      console.log(ssim);

      resizedCanvas.toBlob((scaledBlob) => {
        mat.delete();
        dst.delete();
        URL.revokeObjectURL(url);

        resolve({
          blob: scaledBlob,
          method: interpolationMethod,
          scaleFactor: scaleFactor,
          processingTime: processingTime.toString(),
          psnr: psnr.toFixed(2),
          fsim: fsim.toFixed(4),
          ssim: ssim.toFixed(6),
        });
      }, imageData.type);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

async function processAndStoreScaledImages(file) {
  const processingOverlay = document.getElementById("processingOverlay");
  processingOverlay.style.display = "flex";
  const scalingMethods = ["nearest", "bilinear", "bicubic", "lanczos"];
  const scaleFactors = [0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.0];

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

    for (const method of scalingMethods) {
      for (const scaleFactor of scaleFactors) {
        const scaledImage = await scaleImageWithOpenCV(
          file,
          scaleFactor,
          method,
        );

        const transaction = db.transaction(["images"], "readwrite");
        const store = transaction.objectStore("images");

        await new Promise((resolve, reject) => {
          const request = store.add({
            data: scaledImage.blob,
            type: file.type,
            scaleFactor: scaledImage.scaleFactor,
            method: scaledImage.method,
            processingTime: scaledImage.processingTime,
            psnr: scaledImage.psnr,
            fsim: scaledImage.fsim,
            ssim: scaledImage.ssim,
          });
          request.onsuccess = resolve;
          request.onerror = (event) => reject(event.target.error);
        });
      }
    }

    window.location.href = "display.html";
  } catch (error) {
    console.error("Error processing and storing images", error);
    alert("Failed to process and store images");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("original");
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      if (typeof cv !== "undefined") {
        processAndStoreScaledImages(file);
      } else {
        alert("OpenCV.js is not loaded. Please wait and try again.");
      }
    }
  });
});

function onOpenCvReady() {
  console.log("OpenCV.js is ready");
  const fileInput = document.getElementById("original");
  fileInput.disabled = false;
}

// function calculateFSIM(imageData1, imageData2) {
//   console.log("Image Data 1:", imageData1);
//   console.log("Image Data 2:", imageData2);

//   const grad1 = calculateGradientMagnitude(imageData1);
//   const grad2 = calculateGradientMagnitude(imageData2);

//   console.log("Gradient 1:", grad1);
//   console.log("Gradient 2:", grad2);

//   console.log("Corrected Gradient 1:", grad1);
//   console.log("Corrected Gradient 2:", grad2);

//   let score = 0;
//   let totalPixels = 0;

//   const width = imageData1.width;
//   const height = imageData1.height;

//   // FSIM compares the gradient magnitude similarity
//   for (let y = 1; y < height - 1; y++) {
//     for (let x = 1; x < width - 1; x++) {
//       const g1 = grad1[y * width + x];
//       const g2 = grad2[y * width + x];

//       // Enhanced similarity calculation
//       if (g1 !== 0 || g2 !== 0) {
//         score += (2 * g1 * g2 + 0.01) / (g1 * g1 + g2 * g2 + 0.01);
//         totalPixels++;
//       }
//     }
//   }

//   return totalPixels > 0 ? score / totalPixels : 0;
// }

// function calculateGradientMagnitude(imageData) {
//   const width = imageData.width;
//   const height = imageData.height;
//   const data = imageData.data;
//   const grad = new Array(width * height);

//   // Sobel operator kernels for edge detection
//   const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]; // Horizontal gradient
//   const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]; // Vertical gradient

//   // Apply Sobel filter to compute gradients
//   for (let y = 1; y < height - 1; y++) {
//     for (let x = 1; x < width - 1; x++) {
//       let gxVal = 0;
//       let gyVal = 0;

//       // Apply the kernels to the local region around pixel (x, y)
//       // for (let ky = -1; ky <= 1; ky++) {
//       //   for (let kx = -1; kx <= 1; kx++) {
//       //     const pixel = (y + ky) * width + (x + kx);
//       //     const gray =
//       //       0.2989 * data[pixel * 4] +
//       //       0.587 * data[pixel * 4 + 1] +
//       //       0.114 * data[pixel * 4 + 2];
//       //     gxVal += gx[(ky + 1) * 3 + (kx + 1)] * gray;
//       //     gyVal += gy[(ky + 1) * 3 + (kx + 1)] * gray;
//       //   }
//       // }

//       const index = (y * width + x) * 4; // Each pixel has 4 values (RGBA)
//       const gray =
//         0.2989 * data[index] +
//         0.587 * data[index + 1] +
//         0.114 * data[index + 2];

//       // Apply kernels to the local region
//       for (let ky = -1; ky <= 1; ky++) {
//         for (let kx = -1; kx <= 1; kx++) {
//           const neighborIndex = ((y + ky) * width + (x + kx)) * 4;
//           const neighborGray =
//             0.2989 * data[neighborIndex] +
//             0.587 * data[neighborIndex + 1] +
//             0.114 * data[neighborIndex + 2];

//           gxVal += gx[(ky + 1) * 3 + (kx + 1)] * neighborGray;
//           gyVal += gy[(ky + 1) * 3 + (kx + 1)] * neighborGray;
//         }
//       }

//       // Compute gradient magnitude
//       grad[y * width + x] = Math.sqrt(gxVal * gxVal + gyVal * gyVal);
//     }
//   }

//   return grad;
// }

function processImages(canvas1, canvas2) {
  const width1 = canvas1.width;
  const height1 = canvas1.height;
  const width2 = canvas2.width;
  const height2 = canvas2.height;

  let resizedCanvas1 = canvas1;
  let resizedCanvas2 = canvas2;

  if (width1 !== width2 || height1 !== height2) {
    if (width1 * height1 > width2 * height2) {
      resizedCanvas2 = resizeCanvasToMatch(canvas2, width1, height1);
    } else {
      resizedCanvas1 = resizeCanvasToMatch(canvas1, width2, height2);
    }
  }

  // Extract image data
  const ctx1 = resizedCanvas1.getContext("2d");
  const ctx2 = resizedCanvas2.getContext("2d");
  const imageData1 = ctx1.getImageData(
    0,
    0,
    resizedCanvas1.width,
    resizedCanvas1.height,
  );
  const imageData2 = ctx2.getImageData(
    0,
    0,
    resizedCanvas2.width,
    resizedCanvas2.height,
  );

  // Calculate FSIM
  const fsimScore = calculateFSIM(imageData1, imageData2);
  return fsimScore;
}

function resizeCanvasToMatch(sourceCanvas, targetWidth, targetHeight) {
  const resizedCanvas = document.createElement("canvas");
  const ctx = resizedCanvas.getContext("2d");
  resizedCanvas.width = targetWidth;
  resizedCanvas.height = targetHeight;

  // Draw the source canvas onto the resized canvas
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return resizedCanvas;
}

// Helper function to calculate the gradient magnitude of an image
function calculateGradientMagnitude(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const grad = new Array(width * height);

  // Sobel operator kernels for edge detection
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]; // Horizontal gradient
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]; // Vertical gradient

  // Apply Sobel filter to compute gradients
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gxVal = 0;
      let gyVal = 0;

      // Apply the kernels to the local region around pixel (x, y)
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = (y + ky) * width + (x + kx);
          const gray =
            0.2989 * data[pixel * 4] +
            0.587 * data[pixel * 4 + 1] +
            0.114 * data[pixel * 4 + 2];
          gxVal += gx[(ky + 1) * 3 + (kx + 1)] * gray;
          gyVal += gy[(ky + 1) * 3 + (kx + 1)] * gray;
        }
      }

      // Compute gradient magnitude
      grad[y * width + x] = Math.sqrt(gxVal * gxVal + gyVal * gyVal);
    }
  }

  return grad;
}

function calculateFSIM(imageData1, imageData2) {
  const grad1 = calculateGradientMagnitude(imageData1);
  const grad2 = calculateGradientMagnitude(imageData2);

  let score = 0;
  let totalPixels = 0;

  const width = imageData1.width;
  const height = imageData1.height;

  // FSIM compares the gradient magnitude similarity
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const g1 = grad1[y * width + x];
      const g2 = grad2[y * width + x];

      // Enhanced similarity calculation
      if (g1 !== 0 || g2 !== 0) {
        score += (2 * g1 * g2 + 0.01) / (g1 * g1 + g2 * g2 + 0.01);
        totalPixels++;
      }
    }
  }

  return totalPixels > 0 ? score / totalPixels : 0;
}

function calculatePSNR(original, scaled) {
  // Resize the original canvas to match the scaled canvas size
  const resizedOriginal = resizeImage(original, scaled.width, scaled.height);
  const resizedScaled = resizeImage(scaled, scaled.width, scaled.height);

  // Calculate MSE
  const mse = calculateMSE(resizedOriginal, resizedScaled);

  // Calculate PSNR
  const psnr = calculatePSNRFromMSE(mse);

  console.log("PSNR: ", psnr);

  // Return the calculated PSNR
  return psnr;
}

function resizeImage(image, width, height) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

function calculateMSE(original, comparison) {
  const width = original.width;
  const height = original.height;
  let mse = 0;

  const originalCtx = original.getContext("2d");
  const comparisonCtx = comparison.getContext("2d");

  // Get image data for both images
  const originalData = originalCtx.getImageData(0, 0, width, height).data;
  const comparisonData = comparisonCtx.getImageData(0, 0, width, height).data;

  // Calculate squared differences for RGB channels
  for (let i = 0; i < width * height * 4; i += 4) {
    const rDiff = originalData[i] - comparisonData[i];
    const gDiff = originalData[i + 1] - comparisonData[i + 1];
    const bDiff = originalData[i + 2] - comparisonData[i + 2];

    mse += rDiff * rDiff + gDiff * gDiff + bDiff * bDiff;
  }

  return mse / (width * height * 3); // Normalize by the number of pixels (3 for RGB)
}

function calculatePSNRFromMSE(mse) {
  if (mse === 0) {
    return Infinity; // If MSE is 0, PSNR is infinite
  }
  const maxPixelValue = 255.0;
  return 10 * Math.log10((maxPixelValue * maxPixelValue) / mse);
}

function calculateSSIM(imageData1, imageData2) {
  // Resize the original canvas to match the scaled canvas size
  const resizedOriginal = resizeImage(
    imageData1,
    imageData2.width,
    imageData2.height,
  );
  const resizedScaled = resizeImage(
    imageData2,
    imageData2.width,
    imageData2.height,
  );

  // Calculate SSIM
  const ssim = calculateSSIMFromImages(resizedOriginal, resizedScaled);
  return ssim;
}

// Function to calculate SSIM from two images
function calculateSSIMFromImages(original, comparison, windowSize = 8) {
  const width = original.width;
  const height = original.height;
  let ssim = 0.0;
  const C1 = 6.5025;
  const C2 = 58.5225;

  // Slide a window over the images and calculate SSIM for each window
  for (let x = 0; x < width - windowSize; x++) {
    for (let y = 0; y < height - windowSize; y++) {
      const originalWindow = getWindow(original, x, y, windowSize);
      const comparisonWindow = getWindow(comparison, x, y, windowSize);

      const muX = mean(originalWindow);
      const muY = mean(comparisonWindow);

      const sigmaX = stddev(originalWindow, muX);
      const sigmaY = stddev(comparisonWindow, muY);

      const covariance = calculateCovariance(
        originalWindow,
        comparisonWindow,
        muX,
        muY,
      );

      // Compute SSIM for the current window
      const luminance = (2 * muX * muY + C1) / (muX * muX + muY * muY + C1);
      const contrast =
        (2 * sigmaX * sigmaY + C2) / (sigmaX * sigmaX + sigmaY * sigmaY + C2);
      const structure = (covariance + C2 / 2) / (sigmaX * sigmaY + C2 / 2);

      // SSIM for this window
      const windowSSIM = luminance * contrast * structure;
      ssim += windowSSIM;
    }
  }

  // Average SSIM over all windows
  return ssim / ((width - windowSize) * (height - windowSize));
}

// Function to extract a window from an image
function getWindow(image, x, y, windowSize) {
  const window = [];
  const ctx = image.getContext("2d");
  const data = ctx.getImageData(x, y, windowSize, windowSize).data;

  for (let i = 0; i < windowSize; i++) {
    window[i] = [];
    for (let j = 0; j < windowSize; j++) {
      window[i][j] = getGrayScale(data, i * windowSize + j);
    }
  }

  return window;
}

// Function to calculate grayscale value from an RGB value
function getGrayScale(data, index) {
  const r = data[index * 4];
  const g = data[index * 4 + 1];
  const b = data[index * 4 + 2];
  return 0.2989 * r + 0.587 * g + 0.114 * b;
}

// Function to calculate the mean of a window
function mean(window) {
  let sum = 0.0;
  window.forEach((row) => {
    row.forEach((value) => {
      sum += value;
    });
  });
  return sum / (window.length * window[0].length);
}

// Function to calculate the standard deviation of a window
function stddev(window, mean) {
  let sum = 0.0;
  window.forEach((row) => {
    row.forEach((value) => {
      sum += (value - mean) ** 2;
    });
  });
  return Math.sqrt(sum / (window.length * window[0].length));
}

// Function to calculate the covariance between two windows
function calculateCovariance(window1, window2, mean1, mean2) {
  let sum = 0.0;
  for (let i = 0; i < window1.length; i++) {
    for (let j = 0; j < window1[i].length; j++) {
      sum += (window1[i][j] - mean1) * (window2[i][j] - mean2);
    }
  }
  return sum / (window1.length * window1[0].length);
}
