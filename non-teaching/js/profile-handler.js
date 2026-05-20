/**
 * Profile Handler for Non-Teaching Staff
 * Manages profile image uploads to Cloudinary and database updates.
 */

const ProfileHandler = {
    cloudinaryConfig: null,
    isUploading: false,

    /**
     * Fetch Cloudinary configuration from the backend
     */
    async fetchConfig() {
        if (this.cloudinaryConfig) return this.cloudinaryConfig;

        try {
            const headers = {};
            if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                headers['Authorization'] = `Bearer ${token}`;
            }
            const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/config/cloudinary`, { headers });
            const data = await response.json();
            if (data.success && data.config) {
                this.cloudinaryConfig = data.config;
                return this.cloudinaryConfig;
            }
            throw new Error('Could not load upload configuration');
        } catch (error) {
            console.error('❌ Cloudinary Config Error:', error);
            return null;
        }
    },

    /**
     * Main upload function
     */
    async uploadImage(file, email) {
        if (this.isUploading) return;

        try {
            this.isUploading = true;
            this.updateUIStatus(true);

            const config = await this.fetchConfig();
            if (!config) throw new Error('Upload service unavailable');

            // 1. Upload to Cloudinary
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', config.uploadPreset);
            formData.append('folder', 'teacher-profiles');

            const publicId = `teacher_${email.replace(/[@. ]/g, '_')}_${Date.now()}`;
            formData.append('public_id', publicId);

            const cloudRes = await fetch(
                `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
                { method: 'POST', body: formData }
            );

            if (!cloudRes.ok) throw new Error('Failed to upload image to cloud');
            const cloudData = await cloudRes.json();
            const imageUrl = cloudData.secure_url;

            // 2. Update Backend
            const headers = { 'Content-Type': 'application/json' };
            if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                headers['Authorization'] = `Bearer ${token}`;
            }
            const backendRes = await fetch(`${window.APP_CONFIG.API_BASE_URL}/teacher/profile/${encodeURIComponent(email)}/image`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ profileImageUrl: imageUrl })
            });

            const backendData = await backendRes.json();
            if (!backendData.success) throw new Error(backendData.error || 'Failed to save profile');

            // 3. Success!
            this.showNotification('Profile photo updated successfully!', 'success');

            // Update all avatars on page
            this.refreshAvatars(imageUrl);

        } catch (error) {
            console.error('❌ Upload Error:', error);
            this.showNotification(error.message, 'error');
        } finally {
            this.isUploading = false;
            this.updateUIStatus(false);
        }
    },

    /**
     * Update UI to reflect uploading state
     */
    updateUIStatus(isLoading) {
        const avatar = document.getElementById('headerAvatar');
        if (!avatar) return;

        if (isLoading) {
            avatar.dataset.oldContent = avatar.innerHTML;
            avatar.innerHTML = `<span class="material-symbols-rounded" style="font-size: 16px; animation: spin 1s linear infinite;">sync</span>`;
            avatar.style.opacity = '0.7';
        } else {
            avatar.style.opacity = '1';
        }
    },

    /**
     * Refresh all user avatars on the current page
     */
    refreshAvatars(url) {
        const avatars = document.querySelectorAll('#headerAvatar, .user-avatar, .sb-team-avatar');
        avatars.forEach(av => {
            av.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        });
    },

    /**
     * Helper for notifications (standalone)
     */
    showNotification(msg, type = 'success') {
        // Use existing if available
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type);
            return;
        }

        // Create notification element
        const id = 'profile-toast-' + Date.now();
        const toast = document.createElement('div');
        toast.id = id;
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: ${type === 'success' ? '#10B981' : '#EF4444'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            font-family: sans-serif;
            font-size: 14px;
            font-weight: 600;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);

        // Show
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);

        // Hide
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Initialize file input and listeners
function initProfileUpload(userEmail) {
    if (!userEmail) return;

    // Create hidden file input if it doesn't exist
    let fileInput = document.getElementById('profileImageInput');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'profileImageInput';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }

    // Trigger file picker on avatar click
    const avatarPill = document.querySelector('.avatar-pill');
    if (avatarPill) {
        avatarPill.addEventListener('click', () => fileInput.click());
        // Set CSS cursor
        avatarPill.style.cursor = 'pointer';
    }

    // Handle file selection
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                ProfileHandler.showNotification('Image too large. Max 5MB.', 'error');
                return;
            }
            ProfileHandler.uploadImage(file, userEmail);
        }
    };
}

window.initProfileUpload = initProfileUpload;
