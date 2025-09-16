// Import Firebase functions
import { 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot,
    orderBy,
    query,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';

// Global variables
let complaints = [];
let unsubscribe = null;
let selectedFiles = [];

// DOM elements
const postBtn = document.getElementById('postBtn');
const testStorageBtn = document.getElementById('testStorageBtn');
const postModal = document.getElementById('postModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const complaintForm = document.getElementById('complaintForm');
const complaintsContainer = document.getElementById('complaintsContainer');
const noComplaints = document.getElementById('noComplaints');
const fileInput = document.getElementById('attachments');
const fileUploadLabel = document.getElementById('fileUploadLabel');
const filePreview = document.getElementById('filePreview');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Wait for Firebase to be initialized
    setTimeout(() => {
        console.log('🔥 Firebase initialization check:');
        console.log('- Database (db):', !!window.db);
        console.log('- Storage:', !!window.storage);
        console.log('- App:', !!window.app);
        console.log('- Storage bucket:', window.storage?.app?.options?.storageBucket);
        
        if (window.db && window.storage) {
            console.log('✅ Firebase fully initialized');
            showNotification('Firebase connected successfully!', 'success');
            setupEventListeners();
            setupRealtimeListener();
            setupFileUpload();
        } else {
            console.error('❌ Firebase not fully initialized. Please check your configuration.');
            if (!window.storage) {
                console.error('❌ Firebase Storage not available. Make sure Storage is enabled in your Firebase project.');
                showNotification('Firebase Storage not enabled. File uploads disabled.', 'error');
            }
            setupEventListeners();
            setupFileUpload();
            displayComplaints();
        }
    }, 1000);
});

// Event listeners
function setupEventListeners() {
    postBtn.addEventListener('click', openModal);
    testStorageBtn.addEventListener('click', testFirebaseStorage);
    closeModal.addEventListener('click', closeModalHandler);
    cancelBtn.addEventListener('click', closeModalHandler);
    complaintForm.addEventListener('submit', handleFormSubmit);
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === postModal) {
            closeModalHandler();
        }
    });
}

// Setup file upload functionality
function setupFileUpload() {
    if (!fileInput) return;
    
    fileInput.addEventListener('change', handleFileSelection);
    
    // Drag and drop functionality
    fileUploadLabel.addEventListener('dragover', handleDragOver);
    fileUploadLabel.addEventListener('dragleave', handleDragLeave);
    fileUploadLabel.addEventListener('drop', handleFileDrop);
}

// File handling functions
function handleFileSelection(event) {
    const files = Array.from(event.target.files);
    updateSelectedFiles(files);
}

function handleDragOver(event) {
    event.preventDefault();
    fileUploadLabel.classList.add('drag-over');
}

function handleDragLeave(event) {
    event.preventDefault();
    fileUploadLabel.classList.remove('drag-over');
}

function handleFileDrop(event) {
    event.preventDefault();
    fileUploadLabel.classList.remove('drag-over');
    const files = Array.from(event.dataTransfer.files);
    updateSelectedFiles(files);
}

function updateSelectedFiles(newFiles) {
    // Filter valid files (images and audio)
    const validFiles = newFiles.filter(file => {
        return file.type.startsWith('image/') || file.type.startsWith('audio/');
    });
    
    if (validFiles.length !== newFiles.length) {
        showNotification('Some files were skipped. Only images and audio files are allowed.', 'error');
    }
    
    // Add new files to selectedFiles array
    selectedFiles = [...selectedFiles, ...validFiles];
    
    // Update preview
    updateFilePreview();
}

function updateFilePreview() {
    filePreview.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = `file-item ${file.type.startsWith('image/') ? 'image' : 'audio'}`;
        
        const fileIcon = file.type.startsWith('image/') ? '🖼️' : '🎵';
        const fileSize = formatFileSize(file.size);
        
        fileItem.innerHTML = `
            <span class="file-icon">${fileIcon}</span>
            <span class="file-name">${file.name}</span>
            <span class="file-size">${fileSize}</span>
            <button type="button" class="file-remove" onclick="removeFile(${index})">×</button>
        `;
        
        filePreview.appendChild(fileItem);
    });
}

window.removeFile = function(index) {
    selectedFiles.splice(index, 1);
    updateFilePreview();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Setup real-time listener for Firestore
function setupRealtimeListener() {
    if (!window.db) return;
    
    try {
        const complaintsRef = collection(window.db, 'complaints');
        const q = query(complaintsRef, orderBy('timestamp', 'desc'));
        
        unsubscribe = onSnapshot(q, (querySnapshot) => {
            complaints = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                complaints.push({
                    id: doc.id,
                    ...data,
                    timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp) || new Date()
                });
            });
            displayComplaints();
        }, (error) => {
            console.error('Error listening to complaints:', error);
            showNotification('Error loading complaints. Check your Firebase configuration.', 'error');
        });
    } catch (error) {
        console.error('Error setting up real-time listener:', error);
        showNotification('Firebase connection error. Please check your configuration.', 'error');
    }
}

// Modal functions
function openModal() {
    postModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModalHandler() {
    postModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    complaintForm.reset();
    selectedFiles = [];
    updateFilePreview();
}

// Form submission handler
async function handleFormSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(complaintForm);
    const complaint = {
        studentName: formData.get('studentName').trim(),
        floorNumber: parseInt(formData.get('floorNumber')),
        flatNumber: formData.get('flatNumber').trim(),
        issueType: formData.get('issueType'),
        description: formData.get('description').trim(),
        timestamp: window.db ? serverTimestamp() : new Date().toISOString(),
        resolved: false,
        attachments: []
    };
    
    // Validate form data
    if (!complaint.studentName || !complaint.floorNumber || !complaint.flatNumber || !complaint.issueType) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        // Show loading notification
        showNotification('Uploading complaint...', 'info');
        
        // Upload files to Firebase Storage if any
        if (selectedFiles.length > 0 && window.storage) {
            console.log(`📤 Starting upload of ${selectedFiles.length} files...`);
            showNotification('Uploading files...', 'info');
            
            const uploadPromises = selectedFiles.map(async (file, index) => {
                try {
                    const fileName = `${Date.now()}_${file.name}`;
                    const fileRef = ref(window.storage, `complaints/${fileName}`);
                    
                    console.log(`📁 File ${index + 1}/${selectedFiles.length}:`, {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        path: `complaints/${fileName}`
                    });
                    
                    console.log('🔄 Uploading to Firebase Storage...');
                    const snapshot = await uploadBytes(fileRef, file);
                    console.log('✅ Upload successful, getting download URL...');
                    
                    const downloadURL = await getDownloadURL(snapshot.ref);
                    console.log('✅ Download URL obtained:', downloadURL);
                    
                    return {
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        url: downloadURL,
                        path: snapshot.ref.fullPath
                    };
                } catch (error) {
                    console.error(`❌ Error uploading file ${file.name}:`, error);
                    console.error('Error details:', {
                        code: error.code,
                        message: error.message,
                        serverResponse: error.serverResponse
                    });
                    showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
                    throw error;
                }
            });
            
            try {
                complaint.attachments = await Promise.all(uploadPromises);
                console.log('🎉 All files uploaded successfully!');
                showNotification('Files uploaded successfully!', 'success');
            } catch (error) {
                console.error('❌ Some files failed to upload:', error);
                showNotification('Some files failed to upload. Posting complaint without attachments.', 'error');
                complaint.attachments = [];
            }
        } else if (selectedFiles.length > 0) {
            console.warn('⚠️ Files selected but Firebase Storage not available');
            showNotification('Firebase Storage not available. Files will not be uploaded.', 'warning');
            complaint.attachments = [];
        }
        
        if (window.db) {
            // Add to Firestore
            await addDoc(collection(window.db, 'complaints'), complaint);
            showNotification('Complaint posted successfully!', 'success');
        } else {
            // Fallback to local storage for demo
            complaint.id = Date.now().toString();
            complaint.timestamp = new Date().toISOString();
            complaints.unshift(complaint);
            displayComplaints();
            showNotification('Complaint posted (demo mode)!', 'success');
        }
        
        // Close modal and reset form
        closeModalHandler();
        
    } catch (error) {
        console.error('Error adding complaint:', error);
        showNotification('Error posting complaint. Please try again.', 'error');
    }
}

// Display complaints
function displayComplaints() {
    if (complaints.length === 0) {
        noComplaints.style.display = 'block';
        complaintsContainer.innerHTML = '';
        complaintsContainer.appendChild(noComplaints);
        return;
    }
    
    noComplaints.style.display = 'none';
    complaintsContainer.innerHTML = '';
    
    complaints.forEach(complaint => {
        const complaintCard = createComplaintCard(complaint);
        complaintsContainer.appendChild(complaintCard);
    });
}

// Create complaint card element
function createComplaintCard(complaint) {
    const card = document.createElement('div');
    card.className = `complaint-card ${complaint.resolved ? 'resolved' : ''}`;
    card.dataset.id = complaint.id;
    
    const timeAgo = getTimeAgo(complaint.timestamp);
    
    // Build attachments HTML
    let attachmentsHtml = '';
    if (complaint.attachments && complaint.attachments.length > 0) {
        const attachmentItems = complaint.attachments.map((attachment, index) => {
            const isImage = attachment.type.startsWith('image/');
            if (isImage) {
                return `
                    <div class="attachment-item image" onclick="openAttachmentModal('${attachment.url}', '${attachment.type}', '${attachment.name}')">
                        <img src="${attachment.url}" alt="${attachment.name}" loading="lazy">
                    </div>
                `;
            } else {
                return `
                    <div class="attachment-item audio" onclick="openAttachmentModal('${attachment.url}', '${attachment.type}', '${attachment.name}')">
                        <span class="audio-icon">🎵</span>
                        <span class="audio-name">${attachment.name}</span>
                    </div>
                `;
            }
        }).join('');
        
        attachmentsHtml = `
            <div class="complaint-attachments">
                <div class="attachment-label">Attachments:</div>
                <div class="attachment-grid">
                    ${attachmentItems}
                </div>
            </div>
        `;
    }
    
    card.innerHTML = `
        ${complaint.resolved ? '<div class="resolved-badge">Resolved</div>' : ''}
        <div class="complaint-header">
            <div class="student-info">
                <h3>${escapeHtml(complaint.studentName)}</h3>
                <div class="student-details">
                    Floor: ${complaint.floorNumber} | Flat: ${escapeHtml(complaint.flatNumber)}
                </div>
            </div>
        </div>
        <div class="issue-type ${complaint.issueType}">
            ${capitalizeFirst(complaint.issueType)}
        </div>
        ${complaint.description ? `<div class="complaint-description">${escapeHtml(complaint.description)}</div>` : ''}
        ${attachmentsHtml}
        <div class="complaint-time">
            Posted ${timeAgo}
        </div>
        <div class="complaint-actions">
            ${complaint.resolved 
                ? '<button class="action-btn unresolve-btn" onclick="toggleResolveStatus(\'' + complaint.id + '\')">Mark as Unresolved</button>'
                : '<button class="action-btn resolve-btn" onclick="toggleResolveStatus(\'' + complaint.id + '\')">Mark as Resolved</button>'
            }
            <button class="action-btn delete-btn" onclick="deleteComplaint('${complaint.id}')">Delete</button>
        </div>
    `;
    
    return card;
}

// Toggle resolve status
window.toggleResolveStatus = async function(id) {
    try {
        if (window.db) {
            const complaint = complaints.find(c => c.id === id);
            if (complaint) {
                const complaintRef = doc(window.db, 'complaints', id);
                await updateDoc(complaintRef, {
                    resolved: !complaint.resolved
                });
                
                const action = !complaint.resolved ? 'resolved' : 'marked as unresolved';
                showNotification(`Complaint ${action}!`, 'success');
            }
        } else {
            // Fallback for demo mode
            const complaint = complaints.find(c => c.id === id);
            if (complaint) {
                complaint.resolved = !complaint.resolved;
                displayComplaints();
                
                const action = complaint.resolved ? 'resolved' : 'marked as unresolved';
                showNotification(`Complaint ${action}!`, 'success');
            }
        }
    } catch (error) {
        console.error('Error updating complaint:', error);
        showNotification('Error updating complaint. Please try again.', 'error');
    }
}

// Delete complaint
window.deleteComplaint = async function(id) {
    if (confirm('Are you sure you want to delete this complaint?')) {
        try {
            if (window.db) {
                // Get complaint data to delete attachments
                const complaint = complaints.find(c => c.id === id);
                
                // Delete attachments from Firebase Storage
                if (complaint && complaint.attachments && complaint.attachments.length > 0) {
                    const deletePromises = complaint.attachments.map(async (attachment) => {
                        if (attachment.path) {
                            const fileRef = ref(window.storage, attachment.path);
                            return deleteObject(fileRef);
                        }
                    });
                    
                    try {
                        await Promise.all(deletePromises);
                    } catch (error) {
                        console.warn('Some files could not be deleted from storage:', error);
                    }
                }
                
                await deleteDoc(doc(window.db, 'complaints', id));
                showNotification('Complaint deleted successfully!', 'success');
            } else {
                // Fallback for demo mode
                complaints = complaints.filter(c => c.id !== id);
                displayComplaints();
                showNotification('Complaint deleted successfully!', 'success');
            }
        } catch (error) {
            console.error('Error deleting complaint:', error);
            showNotification('Error deleting complaint. Please try again.', 'error');
        }
    }
}

// Attachment modal functions
window.openAttachmentModal = function(url, type, name) {
    const modal = document.createElement('div');
    modal.className = 'attachment-modal';
    modal.id = 'attachmentModal';
    
    let content = '';
    if (type.startsWith('image/')) {
        content = `<img src="${url}" alt="${name}">`;
    } else if (type.startsWith('audio/')) {
        content = `
            <h3>${name}</h3>
            <audio controls>
                <source src="${url}" type="${type}">
                Your browser does not support the audio element.
            </audio>
        `;
    }
    
    modal.innerHTML = `
        <div class="attachment-modal-content">
            <span class="modal-close" onclick="closeAttachmentModal()">&times;</span>
            ${content}
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // Close on outside click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeAttachmentModal();
        }
    });
}

window.closeAttachmentModal = function() {
    const modal = document.getElementById('attachmentModal');
    if (modal) {
        modal.remove();
    }
}

// Utility functions
function getTimeAgo(timestamp) {
    const now = new Date();
    const posted = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const diffInMinutes = Math.floor((now - posted) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    
    return posted.toLocaleDateString();
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#667eea'};
        color: white;
        padding: 12px 20px;
        border-radius: 5px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
    `;
    notification.textContent = message;
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.remove();
        style.remove();
    }, 3000);
}

// Clean up listener when page unloads
window.addEventListener('beforeunload', () => {
    if (unsubscribe) {
        unsubscribe();
    }
});

// Test Firebase Storage function
async function testFirebaseStorage() {
    console.log('🧪 Testing Firebase Storage...');
    showNotification('Testing Firebase Storage...', 'info');
    
    if (!window.storage) {
        console.error('❌ Storage not initialized');
        showNotification('Firebase Storage not initialized!', 'error');
        return;
    }
    
    try {
        // Create a small test file
        const testContent = `Test file created at ${new Date().toISOString()}`;
        const testBlob = new Blob([testContent], { type: 'text/plain' });
        
        const testRef = ref(window.storage, `test/${Date.now()}_test.txt`);
        console.log('📤 Uploading test file to:', testRef.fullPath);
        
        const snapshot = await uploadBytes(testRef, testBlob);
        console.log('✅ Test upload successful!');
        
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log('✅ Download URL:', downloadURL);
        
        showNotification('🎉 Firebase Storage test successful!', 'success');
        
        // Clean up test file
        try {
            await deleteObject(testRef);
            console.log('🗑️ Test file cleaned up');
        } catch (cleanupError) {
            console.warn('Could not clean up test file:', cleanupError);
        }
        
    } catch (error) {
        console.error('❌ Storage test failed:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        showNotification(`Storage test failed: ${error.message}`, 'error');
    }
}