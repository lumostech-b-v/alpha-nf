/**
 * UI Protocols - Protocol library management
 */
(function() {
    'use strict';

    let protocols = [];
    let disorderFilter = 'all';

    function extractProtocolDisorder(name) {
        if (!name) return null;
        const matches = name.match(/\(([^()]+)\)/g);
        if (!matches || matches.length === 0) return null;
        return matches[matches.length - 1].slice(1, -1).trim();
    }

    function updateDisorderFilterBar() {
        const bar = document.getElementById('protocolDisorderFilterBar');
        const select = document.getElementById('protocolDisorderSelect');
        if (!bar || !select) return;

        const disorders = [...new Set(
            protocols.map(p => extractProtocolDisorder(p.name)).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));

        if (disorders.length === 0) {
            bar.style.display = 'none';
            return;
        }

        select.innerHTML = `<option value="all" ${disorderFilter === 'all' ? 'selected' : ''}>All disorders</option>` +
            disorders.map(d => `<option value="${d}" ${disorderFilter === d ? 'selected' : ''}>${d}</option>`).join('');

        bar.style.display = 'flex';
    }

    window.filterProtocolsByDisorder = function(disorder) {
        disorderFilter = disorder || 'all';
        renderProtocolsList();
    };
    
    // Shared constants
    const PREDEFINED_BANDS = [
        { name: 'Delta', range: [0.5, 4.0], frequency: 2.25 },
        { name: 'Theta', range: [4.0, 8.0], frequency: 6.0 },
        { name: 'Slow Alpha', range: [8.0, 9.0], frequency: 8.5 },
        { name: 'Alpha', range: [8.0, 12.0], frequency: 10.0 },
        { name: 'Fast Alpha', range: [10.0, 12.0], frequency: 11.0 },
        { name: 'Low Beta', range: [12.0, 15.0], frequency: 13.5 },
        { name: 'Beta', range: [15.0, 20.0], frequency: 17.5 },
        { name: 'High Beta', range: [20.0, 30.0], frequency: 25.0 },
        { name: 'Gamma', range: [30.0, 45.0], frequency: 37.5 }
    ];
    
    const ALL_CHANNELS = ['Fp1', 'Fp2', 'F3', 'F4', 'F7', 'F8', 'Fz', 'C3', 'C4', 'Cz', 
                          'P3', 'P4', 'Pz', 'O1', 'O2', 'T3', 'T4', 'T5', 'T6', 'A1', 'A2'];
    
    function getBandName(range) {
        const match = PREDEFINED_BANDS.find(b => 
            Math.abs(b.range[0] - range[0]) < 0.1 && 
            Math.abs(b.range[1] - range[1]) < 0.1
        );
        return match ? match.name : 'Custom';
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function loadProtocols() {
        try {
            window.ui.showLoading(true);
            protocols = await window.api.getAllProtocols();
            
            // If no protocols, initialize default ones
            if (protocols.length === 0) {
                await window.api.initializeDefaultProtocols();
                protocols = await window.api.getAllProtocols();
            }
            
            renderProtocolsList();
        } catch (error) {
            console.error('Error loading protocols:', error);
        } finally {
            window.ui.showLoading(false);
        }
    }

    function renderProtocolsList() {
        const container = document.getElementById('protocolsListContainer');
        if (!container) return;

        if (!protocols || protocols.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card">
                    <p>No protocols found. Create your first protocol to get started.</p>
                    <button class="btn btn-primary" id="addProtocolFromEmptyBtn">Add Protocol</button>
                </div>
            `;
            document.getElementById('addProtocolFromEmptyBtn')?.addEventListener('click', () => {
                openProtocolModal();
            });
            return;
        }

        updateDisorderFilterBar();

        const filtered = disorderFilter === 'all'
            ? protocols
            : protocols.filter(p => extractProtocolDisorder(p.name) === disorderFilter);

        container.innerHTML = `
            <div class="protocols-grid" id="protocolsGrid">
                ${filtered.length === 0
                    ? '<p style="color:var(--text-secondary);grid-column:1/-1;">No protocols match this filter.</p>'
                    : filtered.map(protocol => {
                    const frequencyBands = protocol.features?.frequency_bands || [];
                    const rewardBands = frequencyBands.filter(b => b.type === 'reward');
                    const inhibitBands = frequencyBands.filter(b => b.type === 'inhibit');
                    const ratioBands = frequencyBands.filter(b => b.type === 'ratio');
                    
                    const isDefault = protocol.is_default || false;
                    
                    return `
                    <div class="protocol-card-library ${isDefault ? 'protocol-default' : ''}">
                        <div class="protocol-card-header">
                            <div class="protocol-title-wrapper">
                                <h3 class="protocol-card-title">${escapeHtml(protocol.name || 'Unnamed Protocol')}</h3>
                                ${isDefault ? `<span class="protocol-badge-default">Default</span>` : ''}
                            </div>
                            ${!isDefault ? `
                            <div class="protocol-card-actions">
                                <button class="btn-icon" title="Edit Protocol" data-protocol-id="${protocol.id}" data-action="edit">
                                    <span class="icon" data-lucide="edit"></span>
                                </button>
                                <button class="btn-icon btn-icon-danger" title="Delete Protocol" data-protocol-id="${protocol.id}" data-action="delete">
                                    <span class="icon" data-lucide="trash-2"></span>
                                </button>
                            </div>
                            ` : `
                            <div class="protocol-card-actions">
                                <span class="protocol-locked-hint" title="Default protocols cannot be edited or deleted">
                                    <span class="icon" data-lucide="lock"></span>
                                </span>
                            </div>
                            `}
                        </div>
                        <div class="protocol-card-body">
                            ${rewardBands.length > 0 ? `
                            <div class="protocol-info-section protocol-reward-section">
                                <div class="protocol-section-label">Reward</div>
                                <div class="protocol-bands-grid">
                                    ${rewardBands.map(band => {
                                        const bandName = getBandName(band.frequency_range);
                                        const channel = band.channels && band.channels.length > 0 ? band.channels[0] : 'N/A';
                                        const range = `${band.frequency_range[0]}-${band.frequency_range[1]}`;
                                        return `
                                        <div class="protocol-band-chip">
                                            <span class="band-chip-name">${escapeHtml(bandName)}</span>
                                            <div class="band-chip-details">
                                                <span class="band-chip-label">Channel:</span>
                                                <span class="band-chip-channel">${escapeHtml(channel)}</span>
                                            </div>
                                            <div class="band-chip-details">
                                                <span class="band-chip-label">Band:</span>
                                                <span class="band-chip-range">${range} Hz</span>
                                            </div>
                                        </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                            ` : ''}
                            ${inhibitBands.length > 0 ? `
                            <div class="protocol-info-section protocol-inhibit-section">
                                <div class="protocol-section-label">Inhibit</div>
                                <div class="protocol-bands-grid">
                                    ${inhibitBands.map(band => {
                                        const bandName = getBandName(band.frequency_range);
                                        const channel = band.channels && band.channels.length > 0 ? band.channels[0] : 'N/A';
                                        const range = `${band.frequency_range[0]}-${band.frequency_range[1]}`;
                                        return `
                                        <div class="protocol-band-chip">
                                            <span class="band-chip-name">${escapeHtml(bandName)}</span>
                                            <div class="band-chip-details">
                                                <span class="band-chip-label">Channel:</span>
                                                <span class="band-chip-channel">${escapeHtml(channel)}</span>
                                            </div>
                                            <div class="band-chip-details">
                                                <span class="band-chip-label">Band:</span>
                                                <span class="band-chip-range">${range} Hz</span>
                                            </div>
                                        </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                            ` : ''}
                            ${ratioBands.length > 0 ? `
                            <div class="protocol-info-section protocol-ratio-section">
                                <div class="protocol-section-label">Ratio</div>
                                <div class="protocol-bands-grid">
                                    ${ratioBands.map(band => {
                                        const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
                                        const ratioName = (band.numerator && band.denominator)
                                            ? `${cap(band.numerator)}/${cap(band.denominator)} Ratio`
                                            : (band.name?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Ratio');
                                        const mode = band.mode || 'enhance';
                                        const modeLabel = mode === 'inhibit' ? 'Inhibit (Reduce)' : 'Reward (Enhance)';
                                        const modeIcon = mode === 'inhibit' ? '⬇️' : '⬆️';
                                        const channel = (band.channels && band.channels.length > 0)
                                            ? band.channels[0]
                                            : 'All';
                                        return `
                                        <div class="protocol-band-chip">
                                            <span class="band-chip-name">${escapeHtml(ratioName)}</span>
                                            <div class="band-chip-details">
                                                <span class="band-chip-label">Mode:</span>
                                                <span class="band-chip-channel">${modeIcon} ${escapeHtml(modeLabel)}</span>
                                            </div>
                                            <div class="band-chip-details">
                                                <span class="band-chip-label">Channel:</span>
                                                <span class="band-chip-channel">${escapeHtml(channel)}</span>
                                            </div>
                                            <div class="band-chip-details">
                                                <span class="band-chip-label">Ratio:</span>
                                                <span class="band-chip-range">${escapeHtml(band.numerator || 'N/A')} / ${escapeHtml(band.denominator || 'N/A')}</span>
                                            </div>
                                        </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                            ` : ''}
                            ${protocol.note ? `
                            <div class="protocol-info-item protocol-description">
                                <span class="protocol-info-label">Notes:</span>
                                <span class="protocol-info-value">${escapeHtml(protocol.note)}</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;

        // Initialize lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

        // Attach event listeners
        container.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const protocolId = parseInt(btn.dataset.protocolId);
                editProtocol(protocolId);
            });
        });

        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const protocolId = parseInt(btn.dataset.protocolId);
                deleteProtocol(protocolId);
            });
        });
    }

    async function editProtocol(protocolId) {
        try {
            const protocol = await window.api.getProtocol(protocolId);
            if (protocol.is_default) {
                return;
            }
            openProtocolModal(protocol);
        } catch (error) {
            console.error('Error loading protocol:', error);
        }
    }

    async function deleteProtocol(protocolId) {
        try {
            const protocol = await window.api.getProtocol(protocolId);
            if (protocol.is_default) {
                return;
            }
        } catch (error) {
            // Continue to show confirmation even if protocol load fails
        }
        
        let deleteConfirmed = false;
        const confirmModalHTML = `
            <div class="modal-content confirm-dialog" style="max-width: 350px;">
                <div class="modal-body" style="padding: var(--spacing-lg);">
                    <p style="margin-bottom: var(--spacing-lg); text-align: center;">
                        Are you sure you want to delete this protocol?<br>
                        <small style="color: var(--text-secondary);">This action cannot be undone.</small>
                    </p>
                    <div class="confirm-dialog-buttons">
                        <button class="btn btn-secondary" id="cancelDeleteBtn" style="flex: 1;">No</button>
                        <button class="btn btn-danger" id="confirmDeleteBtn" style="flex: 1;">Yes</button>
                    </div>
                </div>
            </div>
        `;
        
        window.ui.openModal(confirmModalHTML, 'confirmDeleteModal');
        
        await new Promise((resolve) => {
            const closeModal = () => {
                window.ui.closeModal('confirmDeleteModal');
                resolve();
            };
            
            document.getElementById('cancelDeleteBtn')?.addEventListener('click', closeModal);
            document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => {
                deleteConfirmed = true;
                closeModal();
            });
            
            document.getElementById('confirmDeleteModal')?.addEventListener('click', (e) => {
                if (e.target.id === 'confirmDeleteModal') closeModal();
            });
        });
        
        if (!deleteConfirmed) return;

        try {
            await window.api.deleteProtocol(protocolId);
            await loadProtocols();
        } catch (error) {
            console.error('Error deleting protocol:', error);
        }
    }

    function openProtocolModal(protocol = null) {
        const isEdit = !!protocol;
        const existingBands = protocol?.features?.frequency_bands || [];
        
        function getAvailableChannels(type) {
            const oppositeType = type === 'reward' ? 'inhibit' : 'reward';
            const oppositeItems = document.querySelectorAll(`.selected-bands-list[data-band-type="${oppositeType}"] .selected-band-item`);
            const usedChannels = new Set();
            
            oppositeItems.forEach(item => {
                const value = item.querySelector('.band-channel-select')?.value;
                if (value) usedChannels.add(value);
            });
            
            return ALL_CHANNELS.filter(ch => !usedChannels.has(ch));
        }
        
        function updateChannelDropdowns(type) {
            const items = document.querySelectorAll(`.selected-bands-list[data-band-type="${type}"] .selected-band-item`);
            const availableChannels = getAvailableChannels(type);
            
            items.forEach(item => {
                const select = item.querySelector('.band-channel-select');
                if (!select) return;
                
                const currentValue = select.value;
                select.querySelectorAll('option').forEach(opt => {
                    const channel = opt.value;
                    if (channel === '') return;
                    
                    if (availableChannels.includes(channel)) {
                        opt.disabled = false;
                        opt.style.display = '';
                    } else {
                        opt.disabled = true;
                        opt.style.display = channel === currentValue ? '' : 'none';
                    }
                });
            });
        }
        
        const rewardBands = new Map();
        const inhibitBands = new Map();
        const customRewardBands = [];
        const customInhibitBands = [];
        const ratioBands = [];
        
        existingBands.forEach(band => {
            // Handle ratio bands separately
            if (band.type === 'ratio') {
                ratioBands.push(band);
                return;
            }
            
            const match = PREDEFINED_BANDS.find(pb => 
                band.frequency_range && band.frequency_range[0] === pb.range[0] && 
                band.frequency_range[1] === pb.range[1]
            );
            
            const bandConfig = { channels: band.channels || [] };
            
            if (match) {
                const targetMap = band.type === 'inhibit' ? inhibitBands : rewardBands;
                targetMap.set(match.name, { ...match, ...bandConfig });
            } else if (band.frequency_range) {
                const customBand = {
                    ...band,
                    customName: `Custom (${band.frequency_range[0]}-${band.frequency_range[1]}Hz)`
                };
                (band.type === 'inhibit' ? customInhibitBands : customRewardBands).push(customBand);
            }
        });

        function generateBandIconGrid(type, selectedBands) {
            return `
                <div class="band-chips band-chips-${type}">
                    ${PREDEFINED_BANDS.map(band => `
                        <button type="button"
                                class="band-chip ${selectedBands.has(band.name) ? 'selected' : ''}"
                                data-band-type="${type}"
                                data-band-name="${escapeHtml(band.name)}"
                                data-frequency="${band.frequency}"
                                data-range-min="${band.range[0]}"
                                data-range-max="${band.range[1]}">
                            <span class="bc-name">${escapeHtml(band.name)}</span>
                            <span class="bc-hz">${band.range[0]}–${band.range[1]}</span>
                        </button>
                    `).join('')}
                </div>
            `;
        }

        function generateSelectedBandItem(name, min, max, freq, channels, type, isPredefined, customIndex = null) {
            const uniqueId = isPredefined ? `predef_${type}_${name.replace(/\s+/g, '_').replace(/[()]/g, '')}` : `custom_${type}_${customIndex}`;
            const selectedChannel = channels && channels.length > 0 ? channels[0] : '';
            const availableChannels = getAvailableChannels(type);
            const channelOptions = ALL_CHANNELS.map(ch => {
                const isAvailable = availableChannels.includes(ch);
                const isSelected = ch === selectedChannel;
                return `<option value="${ch}" ${isSelected ? 'selected' : ''} ${!isAvailable && !isSelected ? 'disabled style="display:none"' : ''}>${ch}</option>`;
            }).join('');
            
            return `
                <div class="selected-band-item sbi" data-band-id="${uniqueId}" data-band-type="${type}" data-predefined="true"
                     data-range-min="${min}" data-range-max="${max}">
                    <span class="sbi-name">${escapeHtml(name)}</span>
                    <span class="sbi-hz">${min}–${max} Hz</span>
                    <div class="sbi-controls">
                        <div class="sbi-ch-wrap">
                            <span class="sbi-ch-label">ch</span>
                            <select class="band-channel-select sbi-ch-select" required>
                                <option value="">—</option>
                                ${channelOptions}
                            </select>
                        </div>
                        <button type="button" class="sbi-remove remove-band-item" title="Remove">
                            <span class="icon" data-lucide="x"></span>
                        </button>
                    </div>
                    <input type="hidden" class="predefined-band-name" value="${escapeHtml(name)}">
                </div>
            `;
        }
        
        function generateSelectedHTML(bandsMap, customBands, type) {
            return Array.from(bandsMap.entries()).map(([name, config]) => {
                const band = PREDEFINED_BANDS.find(b => b.name === name);
                return generateSelectedBandItem(name, band.range[0], band.range[1], band.frequency, config.channels, type, true);
            }).join('') + customBands.map((band, idx) => 
                generateSelectedBandItem(
                    band.customName,
                    band.frequency_range[0],
                    band.frequency_range[1],
                    band.frequency || (band.frequency_range[0] + band.frequency_range[1]) / 2,
                    band.channels || [],
                    type,
                    false,
                    idx
                )
            ).join('');
        }
        
        function getAvailableBandNames() {
            const names = PREDEFINED_BANDS.map(b => b.name);
            document.querySelectorAll('.selected-band-item[data-predefined="false"] .sbi-custom-name').forEach(input => {
                const name = input.value.trim();
                if (name && !names.includes(name)) names.push(name);
            });
            return names;
        }

        function generateRatioBandItem(band, index, extraBandNames = []) {
            const uniqueId = `ratio_${index}`;
            const numeratorValue = band.numerator || '';
            const denominatorValue = band.denominator || '';
            const modeValue = band.mode || 'enhance';

            let selectedChannel = '';
            if (band.channels && band.channels.length > 0) {
                selectedChannel = band.channels[0];
            } else if (band.numerator_channel_index !== undefined) {
                const channelIndex = band.numerator_channel_index;
                if (channelIndex >= 0 && channelIndex < ALL_CHANNELS.length) {
                    selectedChannel = ALL_CHANNELS[channelIndex];
                }
            }

            const allBandNames = [...PREDEFINED_BANDS.map(b => b.name)];
            extraBandNames.forEach(n => { if (!allBandNames.includes(n)) allBandNames.push(n); });

            const makeOptions = (selectedVal) => allBandNames.map(b => {
                const sel = b.toLowerCase() === selectedVal.toLowerCase() ? 'selected' : '';
                return `<option value="${escapeHtml(b)}" ${sel}>${escapeHtml(b)}</option>`;
            }).join('');

            const numeratorOptions = makeOptions(numeratorValue);
            const denominatorOptions = makeOptions(denominatorValue);

            const channelOptions = ALL_CHANNELS.map(ch => {
                const sel = ch === selectedChannel ? 'selected' : '';
                return `<option value="${escapeHtml(ch)}" ${sel}>${escapeHtml(ch)}</option>`;
            }).join('');

            const autoRatioName = numeratorValue && denominatorValue
                ? `${numeratorValue}/${denominatorValue} Ratio`
                : 'Ratio Protocol';
            const ratioName = band.name || autoRatioName;

            return `
                <div class="selected-band-item ratio-band-item" data-band-id="${uniqueId}" data-band-type="ratio" data-ratio-index="${index}">
                    <div class="ratio-frac">
                        <div class="ratio-frac-field">
                            <select class="ratio-numerator-select ratio-frac-sel" required>
                                <option value="">Numerator…</option>
                                ${numeratorOptions}
                                <option value="__custom__">── Custom ──</option>
                            </select>
                            <div class="ratio-custom-fields ratio-numerator-custom" style="display:none">
                                <div class="ratio-custom-hz">
                                    <input type="number" class="ratio-custom-min" placeholder="Min" step="any">
                                    <span>–</span>
                                    <input type="number" class="ratio-custom-max" placeholder="Max" step="any">
                                    <span class="ratio-custom-hz-unit">Hz</span>
                                </div>
                            </div>
                        </div>
                        <div class="ratio-frac-line"></div>
                        <div class="ratio-frac-field">
                            <select class="ratio-denominator-select ratio-frac-sel" required>
                                <option value="">Denominator…</option>
                                ${denominatorOptions}
                                <option value="__custom__">── Custom ──</option>
                            </select>
                            <div class="ratio-custom-fields ratio-denominator-custom" style="display:none">
                                <div class="ratio-custom-hz">
                                    <input type="number" class="ratio-custom-min" placeholder="Min" step="any">
                                    <span>–</span>
                                    <input type="number" class="ratio-custom-max" placeholder="Max" step="any">
                                    <span class="ratio-custom-hz-unit">Hz</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="ratio-side">
                        <div class="rrow-field rrow-field-sm">
                            <label class="rrow-label">Channel</label>
                            <select class="ratio-channel-select rrow-select" required>
                                <option value="">Select…</option>
                                ${channelOptions}
                            </select>
                        </div>
                        <div class="rrow-field rrow-field-sm">
                            <label class="rrow-label">Mode</label>
                            <select class="ratio-mode-select rrow-select">
                                <option value="enhance" ${modeValue === 'enhance' ? 'selected' : ''}>Reward</option>
                                <option value="inhibit" ${modeValue === 'inhibit' ? 'selected' : ''}>Inhibit</option>
                            </select>
                        </div>
                    </div>
                    <button type="button" class="rrow-remove remove-band-item" title="Remove">
                        <span class="icon" data-lucide="x"></span>
                    </button>
                    <input type="hidden" class="ratio-name-input" value="${escapeHtml(ratioName)}">
                    <input type="hidden" class="ratio-display-name" value="${escapeHtml(ratioName)}">
                </div>
            `;
        }
        
        const rewardSelectedHTML = generateSelectedHTML(rewardBands, customRewardBands, 'reward');
        const inhibitSelectedHTML = generateSelectedHTML(inhibitBands, customInhibitBands, 'inhibit');
        const existingCustomNames = [
            ...customRewardBands.map(b => b.customName),
            ...customInhibitBands.map(b => b.customName)
        ].filter(Boolean);
        const ratioSelectedHTML = ratioBands.map((band, idx) => generateRatioBandItem(band, idx, existingCustomNames)).join('');

        const modalHTML = `
            <div class="modal-content pmodal">
                <div class="pmodal-hd">
                    <div>
                        <h3>${isEdit ? 'Edit Protocol' : 'New Protocol'}</h3>
                        <p>Define reward and inhibit targets for neurofeedback training</p>
                    </div>
                    <button class="btn-icon" id="closeProtocolModal">
                        <span class="icon" data-lucide="x"></span>
                    </button>
                </div>

                <div class="pmodal-body">
                    <form id="protocolForm">
                        <input type="text" id="protocolName" class="pmodal-name" required
                               value="${escapeHtml(protocol?.name || '')}"
                               placeholder="Protocol name — e.g. Theta/Beta Training">

                        <!-- Reward -->
                        <div class="pmodal-section">
                            <div class="pmodal-section-hd reward">
                                <span class="pmodal-section-dot reward"></span>
                                <span class="pmodal-section-title">Reward</span>
                                <span class="pmodal-section-sub">— enhance these frequency bands</span>
                                <button type="button" class="pmodal-add-custom" data-band-type="reward">
                                    <span class="icon" data-lucide="plus"></span> Custom
                                </button>
                            </div>
                            ${generateBandIconGrid('reward', rewardBands)}
                            <div class="selected-bands-list pmodal-picks" data-band-type="reward">
                                ${rewardSelectedHTML || '<p class="no-selection-hint">Select bands above to reward</p>'}
                            </div>
                        </div>

                        <!-- Inhibit -->
                        <div class="pmodal-section">
                            <div class="pmodal-section-hd inhibit">
                                <span class="pmodal-section-dot inhibit"></span>
                                <span class="pmodal-section-title">Inhibit</span>
                                <span class="pmodal-section-sub">— suppress these frequency bands</span>
                                <button type="button" class="pmodal-add-custom" data-band-type="inhibit">
                                    <span class="icon" data-lucide="plus"></span> Custom
                                </button>
                            </div>
                            ${generateBandIconGrid('inhibit', inhibitBands)}
                            <div class="selected-bands-list pmodal-picks" data-band-type="inhibit">
                                ${inhibitSelectedHTML || '<p class="no-selection-hint">Select bands above to inhibit</p>'}
                            </div>
                        </div>

                        <!-- Ratio -->
                        <div class="pmodal-section">
                            <div class="pmodal-ratio-hd">
                                <span class="pmodal-section-dot ratio"></span>
                                <span class="pmodal-section-title" style="color:rgb(99,102,241)">Ratio Protocols</span>
                                <span class="pmodal-section-sub">— compare two bands (e.g. Theta ÷ Beta)</span>
                                <button type="button" class="pmodal-add-ratio" id="addCustomBandBtn">
                                    <span class="icon" data-lucide="plus"></span> Add Ratio
                                </button>
                            </div>
                            <div class="selected-bands-list pmodal-ratios" data-band-type="ratio">
                                ${ratioSelectedHTML || '<p class="no-selection-hint">No ratio protocols defined</p>'}
                            </div>
                        </div>

                        <!-- Notes -->
                        <div>
                            <label class="pmodal-notes-label" for="protocolNote">
                                Notes <span class="pmodal-notes-optional">(optional)</span>
                            </label>
                            <textarea id="protocolNote" class="form-control pmodal-notes-input" rows="2"
                                      placeholder="Clinical notes or protocol description…">${escapeHtml(protocol?.note || '')}</textarea>
                        </div>
                    </form>
                </div>

                <div class="pmodal-ft">
                    <button class="btn btn-secondary" id="cancelProtocolBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveProtocolBtn">
                        ${isEdit ? 'Update Protocol' : 'Create Protocol'}
                    </button>
                </div>
            </div>
        `;

        window.ui.openModal(modalHTML, 'protocolModal');

        if (window.lucide) lucide.createIcons();

        const closeProtocolModal = () => window.ui.closeModal('protocolModal');
        
        document.getElementById('closeProtocolModal')?.addEventListener('click', closeProtocolModal);
        document.getElementById('cancelProtocolBtn')?.addEventListener('click', closeProtocolModal);
        document.getElementById('saveProtocolBtn')?.addEventListener('click', () => saveProtocol(protocol?.id));
        
        document.querySelectorAll('.band-chip').forEach(icon => {
            icon.addEventListener('click', () => handleBandIconClick(icon));
        });
        
        document.body.addEventListener('change', (e) => {
            if (e.target.classList.contains('band-channel-select')) {
                updateChannelDropdowns('reward');
                updateChannelDropdowns('inhibit');
            }
        });
        
        document.querySelectorAll('.remove-band-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.selected-band-item');
                const type = item.dataset.bandType;
                
                if (item.dataset.predefined === 'true') {
                    const name = item.querySelector('.predefined-band-name').value;
                    document.querySelector(`.band-chip[data-band-name="${name}"][data-band-type="${type}"]`)?.classList.remove('selected');
                }
                item.remove();
                updateSelectedBandsLists();
                updateChannelDropdowns('reward');
                updateChannelDropdowns('inhibit');
            });
        });
        
        document.getElementById('addCustomBandBtn')?.addEventListener('click', addRatioBand);
        document.getElementById('addRatioBandBtn')?.addEventListener('click', addRatioBand);

        document.querySelectorAll('.pmodal-add-custom').forEach(btn => {
            btn.addEventListener('click', () => addCustomBandInline(btn.dataset.bandType));
        });

        function addCustomBandInline(type) {
            const uid = `custom_${Date.now()}`;
            const availableChannels = getAvailableChannels(type);
            const channelOptions = ALL_CHANNELS.map(ch => {
                const isAvailable = availableChannels.includes(ch);
                return `<option value="${ch}" ${!isAvailable ? 'disabled style="display:none"' : ''}>${ch}</option>`;
            }).join('');
            const rowHTML = `
                <div class="selected-band-item sbi" data-band-id="${uid}" data-band-type="${type}" data-predefined="false">
                    <div class="sbi-hz-wrap">
                        <input type="number" class="sbi-hz-input band-range-min" placeholder="Min" step="any" required>
                        <span class="sbi-hz-sep">–</span>
                        <input type="number" class="sbi-hz-input band-range-max" placeholder="Max" step="any" required>
                        <span class="sbi-hz-unit">Hz</span>
                    </div>
                    <div class="sbi-controls">
                        <div class="sbi-ch-wrap">
                            <span class="sbi-ch-label">ch</span>
                            <select class="band-channel-select sbi-ch-select" required>
                                <option value="">—</option>
                                ${channelOptions}
                            </select>
                        </div>
                        <button type="button" class="sbi-remove remove-band-item" title="Remove">
                            <span class="icon" data-lucide="x"></span>
                        </button>
                    </div>
                </div>
            `;
            const list = document.querySelector(`.selected-bands-list[data-band-type="${type}"]`);
            list.querySelector('.no-selection-hint')?.remove();
            list.insertAdjacentHTML('beforeend', rowHTML);
            const row = list.lastElementChild;
            row.querySelector('.remove-band-item')?.addEventListener('click', () => {
                row.remove();
                updateSelectedBandsLists();
                updateChannelDropdowns('reward');
                updateChannelDropdowns('inhibit');
            });
            if (window.lucide) lucide.createIcons();
            row.querySelector('.band-range-min')?.focus();
        }
        
        function addRatioBand() {
            const ratioList = document.querySelector('.selected-bands-list[data-band-type="ratio"]');
            if (!ratioList) return;
            
            const existingRatios = ratioList.querySelectorAll('.selected-band-item[data-band-type="ratio"]');
            const newIndex = existingRatios.length;
            
            const newRatioHTML = generateRatioBandItem({
                name: '',
                numerator: '',
                denominator: '',
                mode: 'enhance',
                channels: [],
                numerator_channel_index: undefined,
                denominator_channel_index: undefined
            }, newIndex, getAvailableBandNames());
            
            ratioList.insertAdjacentHTML('beforeend', newRatioHTML);
            
            // Remove "no selection" hint if present
            const hint = ratioList.querySelector('.no-selection-hint');
            if (hint) hint.remove();
            
            // Add event listeners for the new ratio band
            const newItem = ratioList.lastElementChild;
            attachRatioBandListeners(newItem);
            
            if (window.lucide) lucide.createIcons();
        }
        
        function updateRatioNameDisplay(item) {
            const numeratorSelect = item.querySelector('.ratio-numerator-select');
            const denominatorSelect = item.querySelector('.ratio-denominator-select');
            const nameInput = item.querySelector('.ratio-name-input');

            const numerator = numeratorSelect?.value?.trim();
            const denominator = denominatorSelect?.value?.trim();
            const currentName = nameInput?.value?.trim();

            if (!currentName || (currentName.includes('/') && !currentName.includes('Ratio'))) {
                if (numerator && denominator) {
                    const numDisplay = numerator.charAt(0).toUpperCase() + numerator.slice(1).toLowerCase();
                    const denDisplay = denominator.charAt(0).toUpperCase() + denominator.slice(1).toLowerCase();
                    if (nameInput) nameInput.value = `${numDisplay}/${denDisplay} Ratio`;
                }
            }
        }
        
        function attachRatioBandListeners(item) {
            function setCustomRequired(customFields, isRequired) {
                customFields?.querySelectorAll('.ratio-custom-min, .ratio-custom-max')
                    .forEach(input => { input.required = isRequired; });
            }

            function handleFracSelect(select, customFields) {
                select?.addEventListener('change', () => {
                    const isCustom = select.value === '__custom__';
                    customFields.style.display = isCustom ? 'flex' : 'none';
                    select.style.display = isCustom ? 'none' : 'block';
                    setCustomRequired(customFields, isCustom);
                    if (isCustom) customFields.querySelector('.ratio-custom-min')?.focus();
                    updateRatioNameDisplay(item);
                });
                customFields?.querySelector('.ratio-custom-min')?.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        customFields.style.display = 'none';
                        select.style.display = 'block';
                        select.value = '';
                        setCustomRequired(customFields, false);
                    }
                });
            }

            handleFracSelect(
                item.querySelector('.ratio-numerator-select'),
                item.querySelector('.ratio-numerator-custom')
            );
            handleFracSelect(
                item.querySelector('.ratio-denominator-select'),
                item.querySelector('.ratio-denominator-custom')
            );

            item.querySelector('.remove-band-item')?.addEventListener('click', () => {
                item.remove();
                updateSelectedBandsLists();
            });
        }
        
        // Attach event listeners for existing ratio bands
        document.querySelectorAll('.selected-bands-list[data-band-type="ratio"] .selected-band-item').forEach(item => {
            attachRatioBandListeners(item);
        });
        
        function handleBandIconClick(icon) {
            const bandName = icon.dataset.bandName;
            const bandType = icon.dataset.bandType;
            const isSelected = icon.classList.contains('selected');
            const itemId = `predef_${bandType}_${bandName.replace(/\s+/g, '_').replace(/[()]/g, '')}`;
            const selectedList = document.querySelector(`.selected-bands-list[data-band-type="${bandType}"]`);
            
            if (isSelected) {
                icon.classList.remove('selected');
                selectedList.querySelector(`[data-band-id="${itemId}"]`)?.remove();
            } else {
                const predefinedBand = PREDEFINED_BANDS.find(b => b.name === bandName);
                if (predefinedBand && !selectedList.querySelector(`[data-band-id="${itemId}"]`)) {
                    icon.classList.add('selected');
                    const itemHTML = generateSelectedBandItem(bandName, predefinedBand.range[0], predefinedBand.range[1], predefinedBand.frequency, [], bandType, true);
                    selectedList.insertAdjacentHTML('beforeend', itemHTML);
                    
                    selectedList.lastElementChild.querySelector('.remove-band-item')?.addEventListener('click', (e) => {
                        const item = e.target.closest('.selected-band-item');
                        document.querySelector(`.band-chip[data-band-name="${item.querySelector('.predefined-band-name').value}"][data-band-type="${item.dataset.bandType}"]`)?.classList.remove('selected');
                        item.remove();
                        updateSelectedBandsLists();
                        updateChannelDropdowns('reward');
                        updateChannelDropdowns('inhibit');
                    });
                    
                    updateChannelDropdowns('reward');
                    updateChannelDropdowns('inhibit');
                }
            }
            updateSelectedBandsLists();
        }
        
        function updateSelectedBandsLists() {
            document.querySelectorAll('.selected-bands-list').forEach(list => {
                const items = list.querySelectorAll('.selected-band-item');
                const hint = list.querySelector('.no-selection-hint');
                
                if (items.length === 0 && !hint) {
                    list.insertAdjacentHTML('beforeend', `<p class="no-selection-hint">No ${list.dataset.bandType} bands selected</p>`);
                } else if (items.length > 0) {
                    hint?.remove();
                }
            });
        }
        
        
        document.getElementById('protocolModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'protocolModal') closeProtocolModal();
        });
    }

    function processBandItem(item, type) {
        const channelSelect = item.querySelector('.band-channel-select');
        const selectedChannel = channelSelect?.value?.trim();
        if (!selectedChannel) return null;

        let rangeMin, rangeMax;
        if (item.dataset.predefined === 'true') {
            rangeMin = parseFloat(item.dataset.rangeMin);
            rangeMax = parseFloat(item.dataset.rangeMax);
        } else {
            rangeMin = parseFloat(item.querySelector('.band-range-min')?.value);
            rangeMax = parseFloat(item.querySelector('.band-range-max')?.value);
        }

        if (isNaN(rangeMin) || isNaN(rangeMax) || rangeMin >= rangeMax) return null;

        return {
            frequency: (rangeMin + rangeMax) / 2,
            frequency_range: [rangeMin, rangeMax],
            channels: [selectedChannel],
            name: `${rangeMin}–${rangeMax}`,
            type
        };
    }
    
    function processRatioBandItem(item) {
        const nameInput = item.querySelector('.ratio-name-input');
        const numeratorSelect = item.querySelector('.ratio-numerator-select');
        const denominatorSelect = item.querySelector('.ratio-denominator-select');
        const channelSelect = item.querySelector('.ratio-channel-select');
        const modeSelect = item.querySelector('.ratio-mode-select');
        
        function readFracValue(select, customFields) {
            if (select?.value === '__custom__') {
                const min = parseFloat(customFields?.querySelector('.ratio-custom-min')?.value);
                const max = parseFloat(customFields?.querySelector('.ratio-custom-max')?.value);
                const name = (!isNaN(min) && !isNaN(max)) ? `${min}–${max}` : '';
                return { name, min, max };
            }
            const name = select?.value?.trim();
            // Resolve predefined band names (e.g. "Low Beta", "Slow Alpha") to their Hz
            // range so the backend never has to look the name up by string.
            const predef = PREDEFINED_BANDS.find(b => b.name === name);
            if (predef) {
                return { name, min: predef.range[0], max: predef.range[1] };
            }
            return { name, min: null, max: null };
        }

        const numData = readFracValue(numeratorSelect, item.querySelector('.ratio-numerator-custom'));
        const denData = readFracValue(denominatorSelect, item.querySelector('.ratio-denominator-custom'));
        let numerator = numData.name;
        let denominator = denData.name;
        const channel = channelSelect?.value?.trim();
        const mode = modeSelect?.value?.trim() || 'enhance';

        if (!numerator || !denominator || !channel) {
            return null;
        }
        
        // Get channel index for backend compatibility
        const channelIndex = ALL_CHANNELS.indexOf(channel);
        if (channelIndex === -1) {
            return null;
        }
        
        // Auto-generate name if not provided
        let name = nameInput?.value?.trim();
        if (!name) {
            // Generate readable name from band names
            const numDisplay = numerator.charAt(0).toUpperCase() + numerator.slice(1).toLowerCase();
            const denDisplay = denominator.charAt(0).toUpperCase() + denominator.slice(1).toLowerCase();
            name = `${numDisplay}/${denDisplay} Ratio`;
        }
        
        const ratioBand = {
            type: 'ratio',
            numerator: numerator,
            denominator: denominator,
            name: name,
            mode: mode,
            channels: [channel],
            numerator_channel_index: channelIndex,
            denominator_channel_index: channelIndex,
            ...(numData.min != null && numData.max != null ? { numerator_range: [numData.min, numData.max] } : {}),
            ...(denData.min != null && denData.max != null ? { denominator_range: [denData.min, denData.max] } : {}),
        };
        
        return ratioBand;
    }
    
    async function saveProtocol(protocolId = null) {
        const form = document.getElementById('protocolForm');
        if (!form?.checkValidity()) {
            form.reportValidity();
            return;
        }

        const rewardBands = document.querySelectorAll('.selected-bands-list[data-band-type="reward"] .selected-band-item');
        const inhibitBands = document.querySelectorAll('.selected-bands-list[data-band-type="inhibit"] .selected-band-item');
        const ratioBands = document.querySelectorAll('.selected-bands-list[data-band-type="ratio"] .selected-band-item');
        
        if (rewardBands.length === 0 && inhibitBands.length === 0 && ratioBands.length === 0) {
            return;
        }
        
        const frequencyBands = [];
        
        for (const item of rewardBands) {
            const band = processBandItem(item, 'reward');
            if (!band) return;
            frequencyBands.push(band);
        }
        
        for (const item of inhibitBands) {
            const band = processBandItem(item, 'inhibit');
            if (!band) return;
            frequencyBands.push(band);
        }
        
        for (const item of ratioBands) {
            const band = processRatioBandItem(item);
            if (!band) return;
            frequencyBands.push(band);
        }
        
        if (frequencyBands.length === 0) return;

        // Determine protocol_type based on bands
        const hasRatioBands = ratioBands.length > 0;
        const protocolType = hasRatioBands ? 'ratio' : 'standard';

        const protocolData = {
            name: document.getElementById('protocolName').value.trim(),
            note: document.getElementById('protocolNote').value.trim() || null,
            features: {
                frequency_bands: frequencyBands,
                protocol_type: protocolType
            }
        };

        try {
            window.ui.showLoading(true);
            if (protocolId) {
                await window.api.updateProtocol(protocolId, protocolData);
            } else {
                await window.api.createProtocol(protocolData);
            }
            window.ui.closeModal('protocolModal');
            await loadProtocols();
        } catch (error) {
            console.error('Error saving protocol:', error);
        } finally {
            window.ui.showLoading(false);
        }
    }

    // Expose functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.loadProtocols = loadProtocols;
    window.uiFunctions.openProtocolModal = openProtocolModal;
})();

