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
          img.method !== "original"
      );
      const orderedImages = ["nearest", "bilinear", "bicubic", "lanczos"].map(
        (method) => images.find((img) => img.method === method)
      );
      resolve(orderedImages);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

function displayImage(image, container, method, time, psnr, ssim, fsim) {
  const reader = new FileReader();
  reader.onload = function (event) {
    const imgElement = document.createElement("img");
    imgElement.src = event.target.result;
    imgElement.alt = "Scaled Image";
    imgElement.className = "scaled-image";
    imgElement.style.cursor = "pointer";
    imgElement.setAttribute("download", "scaled-image.png");

    container.innerHTML = "";
    container.appendChild(imgElement);
  };
  reader.readAsDataURL(image.data);
  method.innerHTML = `<p>${image.method}</p>`;
  time.innerHTML = `<p>Time: ${image.processingTime}ms</p>`;
  if (image.psnr == Infinity) psnr.innerHTML = `<p>PSNR: Perfect Match</p>`;
  else psnr.innerHTML = `<p>PSNR: ${image.psnr}dB</p>`;
  if (image.ssim == 1) ssim.innerHTML = `<p>SSIM: Identical Structures</p>`;
  else ssim.innerHTML = `<p>SSIM: ${image.ssim}dB</p>`;
  if (image.fsim == 1) fsim.innerHTML = `<p>FSIM: Same Features</p>`;
  else fsim.innerHTML = `<p>FSIM: ${image.fsim}dB</p>`;
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
    fsim
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
      fsim
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
  window.location.href = "index.html";
}

document.getElementById("compareBtn").addEventListener("click", function () {
  window.location.href = "comparison.html";
});

// document.addEventListener("DOMContentLoaded", () => {
//   // Create sidebar toggle button
//   const sidebarToggle = document.createElement("button");
//   sidebarToggle.textContent = "☰";
//   sidebarToggle.classList.add("sidebar-toggle");
//   document.body.appendChild(sidebarToggle);

//   // Toggle sidebar functionality
//   sidebarToggle.addEventListener("click", () => {
//     document.body.classList.toggle("sidebar-open");
//   });

//   // Close sidebar when clicking outside
//   document.addEventListener("click", (event) => {
//     const header = document.querySelector("header");
//     const sidebarToggle = document.querySelector(".sidebar-toggle");

//     if (
//       !header.contains(event.target) &&
//       !sidebarToggle.contains(event.target) &&
//       document.body.classList.contains("sidebar-open")
//     ) {
//       document.body.classList.remove("sidebar-open");
//     }
//   });
// });

// document.querySelector(".toggle-menu").addEventListener("click", () => {
//   const options = document.querySelector(".options");
//   options.classList.toggle("active");
// });

document.querySelector(".toggle-menu").addEventListener("click", () => {
  const options = document.querySelector(".options");
  const overlay = document.querySelector(".overlay");

  options.classList.toggle("active");
  overlay.classList.toggle("active");
});

document.querySelector(".overlay").addEventListener("click", () => {
  const options = document.querySelector(".options");
  const overlay = document.querySelector(".overlay");

  options.classList.remove("active");
  overlay.classList.remove("active");
});
