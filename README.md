# ResizeLab
Fully client-side tool to scale images using:
1. Nearest Neighbour Interpolation
2. Bilinear Interpolation
3. Bicubic Interpolation
4. Lanczos Resampling
over the factors 0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.0.

The tool also compares the scaled images with the original using:
1. Peak-Signal-to-Noise Ratio (PSNR)
2. Structural Similarity Index (SSIM)
3. Feature Similarity Index (FSIM)
4. Execution Time
and plots all the data in the form of graphs. 

## Future Enhancements
1. Custom scale factor
2. Limit number of threads used
3. Utilize better implementations of the alogorithms
4. Add more algorithms
5. Batch processing
6. Research the validity of the quality metrics
7. Different quality metrics
