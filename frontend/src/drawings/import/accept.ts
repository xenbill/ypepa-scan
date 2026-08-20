/** File types both import dialogs offer in the picker. Keep in sync with the
    Supported set in backend/Imaging/FileTypes.cs — the server sniffs the real
    type from the file's magic numbers and rejects anything else. */
export const ACCEPT = '.tif,.tiff,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.dwg,.dxf,.dwt,.dgn,.dwf,.dwfx'
