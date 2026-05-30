import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_OM_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.OM_CLOUDINARY_API_KEY,
    api_secret: process.env.OM_CLOUDINARY_API_SECRET,
})

export async function POST(request) {
    try {
        const { publicId } = await request.json()

        if (!publicId) {
            return Response.json({ success: false, error: 'No publicId provided' })
        }

        console.log('[delete-screenshot] Deleting:', publicId)

        // Try exact publicId first
        const result = await cloudinary.uploader.destroy(publicId, {
            invalidate: true,
            resource_type: 'image',
        })

        console.log('[delete-screenshot] Result:', result)

        // If not found, try with office-monitor/ prefix
        if (result.result === 'not found') {
            const withPrefix = `office-monitor/${publicId}`
            console.log('[delete-screenshot] Retrying with prefix:', withPrefix)
            const result2 = await cloudinary.uploader.destroy(withPrefix, {
                invalidate: true,
                resource_type: 'image',
            })
            console.log('[delete-screenshot] Retry result:', result2)
            return Response.json({ success: result2.result === 'ok', result: result2.result })
        }

        return Response.json({ success: result.result === 'ok', result: result.result })
    } catch (error) {
        console.error('[delete-screenshot] Error:', error)
        return Response.json({ success: false, error: error.message })
    }
}