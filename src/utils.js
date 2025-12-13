import Gio from 'gi://Gio';

export const getCurrentDate = () => {
    const date = new Date();
    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;
    return formattedDate;
}

/**
 * Build a unique filename by appending a number if the file already exists.
 * @param {string} directory - Directory path
 * @param {string} baseName - Base filename without extension
 * @param {string} extension - File extension (without dot)
 * @returns {string} - Full path to a unique filename
 */
export function buildUniqueFilename(directory, baseName, extension) {
    let iteration = 0;
    let filename;

    while (true) {
        if (iteration === 0) {
            filename = `${baseName}.${extension}`;
        } else {
            filename = `${baseName}-${iteration}.${extension}`;
        }

        const fullPath = directory.endsWith('/')
            ? `${directory}${filename}`
            : `${directory}/${filename}`;

        const file = Gio.File.new_for_path(fullPath);
        if (!file.query_exists(null)) {
            return fullPath;
        }

        iteration++;
        if (iteration > 1000) {
            // Safety limit
            return fullPath;
        }
    }
}