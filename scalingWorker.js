let cvReady = false;
if (typeof importScripts === "function") {
  importScripts("https://docs.opencv.org/4.10.0/opencv.js");
  cv["onRuntimeInitialized"] = () => {
    cvReady = true;
  };
}

self.onmessage = async function (event) {
  if (!cvReady) {
    await new Promise((resolve) => {
      const checkReady = setInterval(() => {
        if (cvReady) {
          clearInterval(checkReady);
          resolve();
        }
      }, 50);
    });
  }

  const { imageData, width, height, scaleFactor, interpolationMethod, type } =
    event.data;

  try {
    const scaledBlob = await scaleImageWithOpenCV(
      imageData,
      width,
      height,
      scaleFactor,
      interpolationMethod,
      type,
    );
    self.postMessage({ scaledBlob });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

async function scaleImageWithOpenCV(
  imageData,
  width,
  height,
  scaleFactor,
  interpolationMethod,
  type,
) {
  return new Promise((resolve, reject) => {
    try {
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

      const startTime = performance.now();
      const mat = cv.matFromImageData(imageData);
      const dsize = new cv.Size(width, height);
      const dst = new cv.Mat();
      cv.resize(mat, dst, dsize, 0, 0, interpolationFlag);

      const resizedOffscreenCanvas = new OffscreenCanvas(width, height);
      const resizedCtx = resizedOffscreenCanvas.getContext("2d");
      const resizedImageData = new ImageData(
        new Uint8ClampedArray(dst.data),
        width,
        height,
      );
      resizedCtx.putImageData(resizedImageData, 0, 0);

      const endTime = performance.now();
      const processingTime = (endTime - startTime).toFixed(2).toString();

      const mat2 = new cv.Mat();
      cv.resize(
        dst,
        mat2,
        new cv.Size(mat.cols, mat.rows),
        0,
        0,
        interpolationFlag,
      );
      const psnr = calculatePSNR(mat, mat2).toFixed(2).toString();

      const fsim = calculateFSIM(mat, mat2).toFixed(2).toString();

      const ssim = calculateSSIM(mat, mat2).toFixed(2).toString();

      resizedOffscreenCanvas
        .convertToBlob({ type: type, quality: 1 })
        .then((blob) => {
          mat.delete();
          dst.delete();
          mat2.delete();

          resolve({
            blob: blob,
            method: interpolationMethod,
            scaleFactor: scaleFactor,
            processingTime: processingTime,
            psnr: psnr,
            fsim: fsim,
            ssim: ssim,
          });
        })
        .catch((err) => {
          console.error("Error converting canvas to blob:", err);
          reject(err);
        });
    } catch (error) {
      reject(error);
    }
  });
}

function calculateGradientMagnitude(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const grad = new Array(width * height).fill(0);

  // Sobel kernels for x and y gradient
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gxVal = 0;
      let gyVal = 0;

      // Compute gradient using Sobel operator
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = (y + ky) * width + (x + kx);

          // Convert to grayscale using luminance weights
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

function calculateScore(imageData1, imageData2) {
  const grad1 = calculateGradientMagnitude(imageData1);
  const grad2 = calculateGradientMagnitude(imageData2);

  let score = 0;
  let totalPixels = 0;

  const width = imageData1.width;
  const height = imageData1.height;

  const EPSILON = 0.01; // Small constant to prevent division by zero

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const g1 = grad1[y * width + x];
      const g2 = grad2[y * width + x];

      // Robust error checking
      if (!Number.isFinite(g1) || !Number.isFinite(g2)) {
        console.warn(
          `Invalid gradient values at (${x},${y}): g1=${g1}, g2=${g2}`,
        );
        continue;
      }

      // Similarity calculation
      const numerator = 2 * g1 * g2 + EPSILON;
      const denominator = g1 * g1 + g2 * g2 + EPSILON;

      if (denominator !== 0) {
        const localScore = numerator / denominator;

        if (Number.isFinite(localScore)) {
          score += localScore;
          totalPixels++;
        } else {
          console.warn(`Non-finite score at (${x},${y})`);
        }
      }
    }
  }

  return totalPixels > 0 ? score / totalPixels : 0;
}

function calculateFSIM(mat1, mat2) {
  try {
    // Convert OpenCV matrices to ImageData
    const imageData1 = new ImageData(
      new Uint8ClampedArray(mat1.data),
      mat1.cols,
      mat1.rows,
    );

    const imageData2 = new ImageData(
      new Uint8ClampedArray(mat2.data),
      mat2.cols,
      mat2.rows,
    );

    const fsimScore = calculateScore(imageData1, imageData2);
    return fsimScore;
  } catch (error) {
    console.error("Error in calculateFSIM:", error);
    return 0;
  }
}

function calculatePSNR(mat1, mat2) {
  const diff = new cv.Mat();
  cv.absdiff(mat1, mat2, diff);
  const squaredDiff = new cv.Mat();
  cv.pow(diff, 2, squaredDiff);
  const mse = cv.mean(squaredDiff);
  diff.delete();
  squaredDiff.delete();
  if (mse[0] === 0 && mse[1] === 0 && mse[2] === 0) {
    return Infinity;
  }
  const avgMSE = (mse[0] + mse[1] + mse[2]) / 3;
  const maxPixelValue = 255.0;
  return 10 * Math.log10((maxPixelValue * maxPixelValue) / avgMSE);
}

function calculateSSIM(mat1, mat2) {
  // Convert both mats to grayscale
  const grayMat1 = new cv.Mat();
  const grayMat2 = new cv.Mat();
  cv.cvtColor(mat1, grayMat1, cv.COLOR_RGBA2GRAY);
  cv.cvtColor(mat2, grayMat2, cv.COLOR_RGBA2GRAY);

  const width = grayMat1.cols;
  const height = grayMat1.rows;

  const C1 = 0.01 * 255 * 0.01 * 255;
  const C2 = 0.03 * 255 * 0.03 * 255;
  const windowSize = 8;

  let ssimSum = 0;
  let windowCount = 0;

  // Slide window across the image
  for (let y = 0; y <= height - windowSize; y += Math.floor(windowSize / 2)) {
    for (let x = 0; x <= width - windowSize; x += Math.floor(windowSize / 2)) {
      // Extract window data for both images
      const window1 = extractWindowFromMat(grayMat1, x, y, windowSize);
      const window2 = extractWindowFromMat(grayMat2, x, y, windowSize);

      // Calculate local statistics
      const { mean1, mean2, variance1, variance2, covariance } =
        calculateLocalStatistics(window1, window2);

      // Compute SSIM for this window
      const luminance =
        (2 * mean1 * mean2 + C1) / (mean1 * mean1 + mean2 * mean2 + C1);
      const contrast =
        (2 * Math.sqrt(variance1) * Math.sqrt(variance2) + C2) /
        (variance1 + variance2 + C2);
      const structure =
        (covariance + C2 / 2) /
        (Math.sqrt(variance1) * Math.sqrt(variance2) + C2 / 2);

      // Combine SSIM components
      const windowSSIM = luminance * contrast * structure;
      ssimSum += windowSSIM;
      windowCount++;
    }
  }

  // Clean up matrices
  grayMat1.delete();
  grayMat2.delete();

  // Return average SSIM
  return windowCount > 0 ? ssimSum / windowCount : 0;
}

function extractWindowFromMat(mat, startX, startY, windowSize) {
  const window = [];
  const data = mat.data;
  const width = mat.cols;

  for (let y = 0; y < windowSize; y++) {
    window[y] = [];
    for (let x = 0; x < windowSize; x++) {
      const pixelIndex = (startY + y) * width + (startX + x);
      // Grayscale values are in a single channel, so no need to extract R, G, B components
      window[y][x] = data[pixelIndex];
    }
  }

  return window;
}

function calculateLocalStatistics(window1, window2) {
  // Calculate means
  const mean1 = calculateMean(window1);
  const mean2 = calculateMean(window2);

  // Calculate variances
  const variance1 = calculateVariance(window1, mean1);
  const variance2 = calculateVariance(window2, mean2);

  // Calculate covariance
  const covariance = calculateCovariance(window1, window2, mean1, mean2);

  return { mean1, mean2, variance1, variance2, covariance };
}

function calculateMean(window) {
  let sum = 0;
  for (let y = 0; y < window.length; y++) {
    for (let x = 0; x < window[y].length; x++) {
      sum += window[y][x];
    }
  }
  return sum / (window.length * window[0].length);
}

function calculateVariance(window, mean) {
  let sum = 0;
  for (let y = 0; y < window.length; y++) {
    for (let x = 0; x < window[y].length; x++) {
      sum += Math.pow(window[y][x] - mean, 2);
    }
  }
  return sum / (window.length * window[0].length);
}

function calculateCovariance(window1, window2, mean1, mean2) {
  let sum = 0;
  for (let y = 0; y < window1.length; y++) {
    for (let x = 0; x < window1[y].length; x++) {
      sum += (window1[y][x] - mean1) * (window2[y][x] - mean2);
    }
  }
  return sum / (window1.length * window1[0].length);
}
