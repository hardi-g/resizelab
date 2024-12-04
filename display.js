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

async function getImagesByScaleFactor(scaleFactor) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["images"], "readonly");
    const store = transaction.objectStore("images");
    const request = store.getAll();
    request.onsuccess = () => {
      const images = request.result.filter(
        (img) =>
          img.scaleFactor === parseFloat(scaleFactor) &&
          img.method !== "original",
      );
      // Order by method: Nearest, Bilinear, Bicubic, Lanczos
      const orderedImages = ["nearest", "bilinear", "bicubic", "lanczos"].map(
        (method) => images.find((img) => img.method === method),
      );
      resolve(orderedImages);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

const ImageManager = {
  currentImage: null,

  setCurrentImage(image) {
    this.currentImage = image;
  },

  downloadCurrentImage() {
    if (!this.currentImage) return;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(this.currentImage.data);
    link.download = `scaled_${this.currentImage.method}_${this.currentImage.scaleFactor}x.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  },
};

function displayImage(image, container, method, time, psnr, ssim, fsim) {
  const imgElement = document.createElement("img");
  imgElement.src = URL.createObjectURL(image.data);
  imgElement.alt = "Scaled Image";
  imgElement.className = "scaled-image";
  imgElement.style.cursor = "pointer";

  container.innerHTML = "";
  container.appendChild(imgElement);

  method.innerHTML = `<p>${image.method}</p>`;
  time.innerHTML = `<p>Processing Time: ${image.processingTime}ms</p>`;
  psnr.innerHTML = `<p>PSNR: ${image.psnr}dB</p>`;
  ssim.innerHTML = `<p>SSIM: ${image.ssim}dB</p>`;
  fsim.innerHTML = `<p>FSIM: ${image.fsim}dB</p>`;

  imgElement.onload = () => URL.revokeObjectURL(imgElement.src);
  ImageManager.setCurrentImage(image);
}

async function updateImages(scaleFactor) {
  const images = await getImagesByScaleFactor(scaleFactor);
  const imageContainer = document.getElementById("imageContainer");
  const methodLine = document.getElementById("method");
  const timeLine = document.getElementById("time");
  const psnr = document.getElementById("psnr");
  const ssim = document.getElementById("ssim");
  const fsim = document.getElementById("fsim");
  let currentIndex = 0;

  if (images.length === 0) {
    imageContainer.innerHTML = "<p>No images found for this scale factor.</p>";
    return;
  }

  displayImage(
    images[currentIndex],
    imageContainer,
    methodLine,
    timeLine,
    psnr,
    ssim,
    fsim,
  );

  imageContainer.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % images.length;
    displayImage(
      images[currentIndex],
      imageContainer,
      methodLine,
      timeLine,
      psnr,
      ssim,
      fsim,
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const scaleFactorSelect = document.getElementById("factor");
  scaleFactorSelect.addEventListener("change", (event) => {
    const scaleFactor = event.target.value;
    updateImages(scaleFactor);
  });

  updateImages(scaleFactorSelect.value);
});

function homePage() {
  window.location.href = "input.html";
}
