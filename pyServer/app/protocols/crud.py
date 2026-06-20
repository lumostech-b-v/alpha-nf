from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from app.protocols import models, schemas

def get_protocol(db: Session, protocol_id: int, user_id: int) -> Optional[models.ProtocolLibrary]:
    """Get a specific protocol by ID for a user"""
    return db.query(models.ProtocolLibrary).filter(
        and_(
            models.ProtocolLibrary.id == protocol_id,
            models.ProtocolLibrary.user_id == user_id,
            models.ProtocolLibrary.is_active == True
        )
    ).first()

def get_all_protocols(db: Session, user_id: int) -> List[models.ProtocolLibrary]:
    """Get all protocols for a user. Automatically creates hardcoded defaults if none exist."""
    # Always run to ensure any newly added hardcoded defaults are seeded for existing users too
    _auto_create_hardcoded_protocols(db, user_id)

    return db.query(models.ProtocolLibrary).filter(
        and_(
            models.ProtocolLibrary.user_id == user_id,
            models.ProtocolLibrary.is_active == True
        )
    ).order_by(models.ProtocolLibrary.is_default.desc(), models.ProtocolLibrary.name).all()

def create_protocol(db: Session, protocol: schemas.ProtocolCreate, user_id: int) -> models.ProtocolLibrary:
    """Create a new protocol"""
    db_protocol = models.ProtocolLibrary(
        name=protocol.name,
        note=protocol.note,
        features=protocol.features.dict(),
        user_id=user_id,
        is_default=False  # User-created protocols are not default
    )
    db.add(db_protocol)
    db.commit()
    db.refresh(db_protocol)
    return db_protocol

def update_protocol(db: Session, protocol_id: int, protocol_update: schemas.ProtocolUpdate, user_id: int) -> Optional[models.ProtocolLibrary]:
    """Update an existing protocol"""
    db_protocol = get_protocol(db, protocol_id, user_id)
    if not db_protocol:
        return None
    
    # Prevent updating default protocols
    if db_protocol.is_default:
        return None
    
    update_data = protocol_update.dict(exclude_unset=True)
    if 'features' in update_data:
        update_data['features'] = update_data['features'].dict()
    
    for field, value in update_data.items():
        setattr(db_protocol, field, value)
    
    db.commit()
    db.refresh(db_protocol)
    return db_protocol

def delete_protocol(db: Session, protocol_id: int, user_id: int) -> bool:
    """Soft delete a protocol (mark as inactive)"""
    db_protocol = get_protocol(db, protocol_id, user_id)
    if not db_protocol:
        return False
    
    # Prevent deleting default protocols
    if db_protocol.is_default:
        return False
    
    db_protocol.is_active = False
    db.commit()
    return True

_STALE_DEFAULT_NAMES = {
    "Theta/Beta Ratio Training (ADHD)",
}


def _parse_ratio_notation(s: str):
    """Parse '(X-Y Hz) / (A-B Hz)' → ((X, Y), (A, B)) or None."""
    import re
    m = re.match(
        r'\(\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(?:Hz)?\s*\)'
        r'\s*/\s*'
        r'\(\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(?:Hz)?\s*\)',
        s.strip(), re.IGNORECASE,
    )
    if m:
        return (float(m.group(1)), float(m.group(2))), (float(m.group(3)), float(m.group(4)))
    return None


def _range_to_band_name(low: float, high: float) -> str:
    if 3.5 <= low <= 5.5 and 7.0 <= high <= 9.0:
        return "theta"
    if 7.5 <= low <= 9.5 and 10.5 <= high <= 13.0:
        return "alpha"
    if 12.0 <= low <= 16.0 and 14.0 <= high <= 22.0:
        return "beta"
    if 18.5 <= low <= 23.5 and 25.0 <= high <= 36.0:
        return "high_beta"
    if low >= 30.0:
        return "gamma"
    return f"band_{int(low)}_{int(high)}"


def _load_canonical_protocols() -> List[dict]:
    """Load the 28 canonical protocols from JSON files, falling back to hardcoded."""
    import json
    import os
    import re
    import sys

    if getattr(sys, 'frozen', False):
        protocols_dir = os.path.join(sys._MEIPASS, 'protocols')
    else:
        pyserver_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        protocols_dir = os.path.join(pyserver_dir, '..', 'protocols')
        if not os.path.exists(protocols_dir):
            protocols_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
                'protocols',
            )

    json_to_disorder = {
        'adhd.json': 'ADHD',
        'anxiety.json': 'Anxiety',
        'depression.json': 'Depression',
        'insomnia.json': 'Insomnia',
        'migraine.json': 'Migraine',
        'ocd.json': 'OCD',
        'ptsd.json': 'PTSD',
    }

    def _parse_range(freq_str: str):
        freq_str = freq_str.replace('–', '-').replace('—', '-').replace('Hz', '').strip()
        m = re.search(r'(\d+\.?\d*)\s*-\s*(\d+\.?\d*)', freq_str)
        if m:
            return float(m.group(1)), float(m.group(2))
        m = re.search(r'(\d+\.?\d*)', freq_str)
        if m:
            v = float(m.group(1))
            return v - 0.5, v + 0.5
        return None, None

    protocols = []
    for filename, disorder in json_to_disorder.items():
        filepath = os.path.join(protocols_dir, filename)
        if not os.path.exists(filepath):
            continue
        try:
            with open(filepath, 'r') as f:
                json_protocols = json.load(f)
            for jp in json_protocols:
                name = f"{jp['protocol']} ({disorder})"
                channels = [ch.strip() for ch in jp['channel'].split('/')]
                reward_str = jp.get('reward', '-').strip()
                inhibit_str = jp.get('inhibit', '-').strip()
                note = jp.get('note', '')
                frequency_bands = []

                for field_str, band_type, mode in [
                    (reward_str, 'reward', 'enhance'),
                    (inhibit_str, 'inhibit', 'inhibit'),
                ]:
                    if not field_str or field_str == '-':
                        continue
                    ratio = _parse_ratio_notation(field_str)
                    if ratio:
                        num_range, den_range = ratio
                        num_name = _range_to_band_name(*num_range)
                        den_name = _range_to_band_name(*den_range)
                        frequency_bands.append({
                            "type": "ratio",
                            "name": f"{num_name}_{den_name}_ratio",
                            "numerator": num_name,
                            "denominator": den_name,
                            "numerator_range": list(num_range),
                            "denominator_range": list(den_range),
                            "mode": mode,
                            "channels": channels,
                        })
                    else:
                        for part in field_str.split(' + '):
                            lo, hi = _parse_range(part.strip())
                            if lo is not None:
                                frequency_bands.append({
                                    "frequency_range": [lo, hi],
                                    "channels": channels,
                                    "type": band_type,
                                })

                protocols.append({
                    "name": name,
                    "note": note,
                    "features": {"frequency_bands": frequency_bands},
                })
        except Exception as e:
            print(f"Error loading {filename}: {e}")
            continue

    if not protocols:
        print("Warning: JSON protocol files not found. Using hardcoded defaults.")
        return _get_hardcoded_default_protocols()

    return protocols


def sync_all_default_protocols(db: Session) -> None:
    """
    Startup helper — runs once to ensure all users' default protocols match the
    current JSON definitions. Removes stale protocols and upserts canonical ones.
    """
    import app.users.models as _user_models
    canonical = _load_canonical_protocols()
    if not canonical:
        return
    canonical_names = {p["name"] for p in canonical}

    try:
        users = db.query(_user_models.User).all()
    except Exception as e:
        print(f"sync_all_default_protocols: could not query users: {e}")
        return

    for user in users:
        try:
            # Delete any default protocol no longer in the canonical set
            for existing in db.query(models.ProtocolLibrary).filter(
                and_(
                    models.ProtocolLibrary.user_id == user.id,
                    models.ProtocolLibrary.is_default == True,
                )
            ).all():
                if existing.name not in canonical_names:
                    db.delete(existing)

            # Upsert canonical protocols
            for protocol_data in canonical:
                existing = db.query(models.ProtocolLibrary).filter(
                    and_(
                        models.ProtocolLibrary.name == protocol_data["name"],
                        models.ProtocolLibrary.user_id == user.id,
                        models.ProtocolLibrary.is_default == True,
                    )
                ).first()
                if existing:
                    existing.features = protocol_data["features"]
                    existing.note = protocol_data["note"]
                else:
                    db.add(models.ProtocolLibrary(
                        name=protocol_data["name"],
                        note=protocol_data["note"],
                        features=protocol_data["features"],
                        user_id=user.id,
                        is_default=True,
                    ))
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"sync_all_default_protocols: error for user {user.id}: {e}")


def _get_hardcoded_default_protocols() -> List[dict]:
    """Fallback when JSON files are unavailable — must stay in sync with protocols/*.json."""
    return [
        # ADHD Protocols
        {
            "name": "M1: TBR-Normalize (attention/inattention.) (ADHD)",
            "note": "Classic High TBR",
            "features": {
                "frequency_bands": [
                    {
                        "type": "ratio", "name": "theta_beta_ratio",
                        "numerator": "theta", "denominator": "beta",
                        "numerator_range": [4.0, 8.0], "denominator_range": [15.0, 18.0],
                        "mode": "inhibit", "channels": ["Cz"],
                    }
                ]
            }
        },
        {
            "name": "M2: SMR-Stability (Sleep/Anxiety stabilizer.) (ADHD)",
            "note": "Great first phase if anxiety/insomnia present.",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [12.0, 15.0], "channels": ["Cz"], "type": "reward"},
                    {"frequency_range": [2.0, 7.0], "channels": ["Cz"], "type": "inhibit"},
                    {"frequency_range": [20.0, 30.0], "channels": ["Cz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M3: Frontal-Executive Beta-Up (exec boost.) (ADHD)",
            "note": "If Anxiety high, interleave M2 blocks, (better focus, Mental effort)",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [15.0, 20.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [2.0, 7.0], "channels": ["Fz"], "type": "inhibit"},
                    {"frequency_range": [25.0, 35.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M4: Alpha-Calm (calm adjunct.) (ADHD)",
            "note": "Supportive; don't replace ADHD core unless needed",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [8.0, 12.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                    {"frequency_range": [2.0, 7.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        # Anxiety Protocols
        {
            "name": "M1: Calm-Arousal (Alpha-Up / High-Beta-Down) (Anxiety)",
            "note": "Classic Anxiety",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [8.0, 12.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                    {"frequency_range": [2.0, 7.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M2: SMR-Stability (Sleep/Anxiety) (Anxiety)",
            "note": "Helps stabilize anxiety with insomnia/somatic tension",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [12.0, 15.0], "channels": ["Cz"], "type": "reward"},
                    {"frequency_range": [2.0, 7.0], "channels": ["Cz"], "type": "inhibit"},
                    {"frequency_range": [20.0, 30.0], "channels": ["Cz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M3: Alpha-Theta Relaxation (Trauma / Deep Calm) (Anxiety)",
            "note": "Avoid early if hyperarousal very high (risk of dissociation)",
            "features": {
                "frequency_bands": [
                    {
                        "type": "ratio", "name": "theta_alpha_ratio",
                        "numerator": "theta", "denominator": "alpha",
                        "numerator_range": [4.0, 7.0], "denominator_range": [8.0, 12.0],
                        "mode": "enhance", "channels": ["Pz"],
                    },
                    {"frequency_range": [22.0, 30.0], "channels": ["Pz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M4: Frontal Balancing (Depression Comorbidity) (Anxiety)",
            "note": "Only introduce after Calm-Arousal blocks show stabilization",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [15.0, 18.0], "channels": ["F3"], "type": "reward"},
                    {"frequency_range": [8.0, 12.0], "channels": ["F3"], "type": "inhibit"},
                ]
            }
        },
        # Depression Protocols
        {
            "name": "M1: Alpha Assymetry (Left Frontal Activation) (Depression)",
            "note": "Classic Assymetry",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [15.0, 18.0], "channels": ["F3"], "type": "reward"},
                    {"frequency_range": [8.0, 12.0], "channels": ["F3"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M2: Calm-Arousal (Alpha-up / High-beta-down) (Depression)",
            "note": "Interleave M1 when anxiety is prominent",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [8.0, 12.0], "channels": ["CZ"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["CZ"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M3: SMR-Stability (Sleep/Anxiety stabilizer.) (Depression)",
            "note": "First blocks for STABILIZATION / Sleep problem",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [12.0, 15.0], "channels": ["Cz"], "type": "reward"},
                    {"frequency_range": [2.0, 7.0], "channels": ["Cz"], "type": "inhibit"},
                    {"frequency_range": [20.0, 30.0], "channels": ["Cz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M4: Alpha-Theta (Deep relaxation / emotional processing) (Depression)",
            "note": "trauma_intrusion↑, Refractory rumination",
            "features": {
                "frequency_bands": [
                    {
                        "type": "ratio", "name": "theta_alpha_ratio",
                        "numerator": "theta", "denominator": "alpha",
                        "numerator_range": [4.0, 7.0], "denominator_range": [8.0, 12.0],
                        "mode": "enhance", "channels": ["Pz"],
                    },
                    {"frequency_range": [22.0, 30.0], "channels": ["Pz"], "type": "inhibit"},
                ]
            }
        },
        # Insomnia Protocols
        {
            "name": "M1: SMR Sleep-Spindle Training (Insomnia)",
            "note": "Strongest evidence base for insomnia",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [12.0, 15.0], "channels": ["C4"], "type": "reward"},
                    {"frequency_range": [4.0, 8.0], "channels": ["C4"], "type": "inhibit"},
                    {"frequency_range": [20.0, 30.0], "channels": ["C4"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M2: Frontal Hyperarousal Calming (Insomnia)",
            "note": "Lowers Arousal",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [9.0, 12.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M3: Anxiety Comorbidity (Hybrid) (Insomnia)",
            "note": "Add cautiously; insomnia focus stays SMR.",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [8.0, 12.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M4: Depression Comorbidity (Hybrid) (Insomnia)",
            "note": "Add cautiously; insomnia focus stays SMR.",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [15.0, 18.0], "channels": ["F3"], "type": "reward"},
                    {"frequency_range": [8.0, 12.0], "channels": ["F3"], "type": "inhibit"},
                    {"frequency_range": [22.0, 30.0], "channels": ["F3"], "type": "inhibit"},
                ]
            }
        },
        # Migraine Protocols
        {
            "name": "M1: SMR Training for Pain Modulation (Migraine)",
            "note": "Stabilize sensory-motor processing, reduce somatic pain perception",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [12.0, 15.0], "channels": ["Cz"], "type": "reward"},
                    {"frequency_range": [4.0, 8.0], "channels": ["Cz"], "type": "inhibit"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Cz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M2: Alpha Enhancement for Relaxation (Migraine)",
            "note": "Increase cortical relaxation, reduce cortical hyperexcitability (migraine prevention)",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [8.0, 12.0], "channels": ["Pz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Pz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M3: High-beta Down-train (Pain Hyperarousal Reduction) (Migraine)",
            "note": "Reduce hyperarousal, pain amplification, stress reactivity",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [9.0, 12.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M4: Frontal Theta Control (Pain Rumination Reduction) (Migraine)",
            "note": "Reduce pain-related cognitive rumination and helplessness",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [15.0, 18.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [4.0, 7.0], "channels": ["Fz"], "type": "inhibit"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        # OCD Protocols
        {
            "name": "M1: Frontal De-Chatter (High-Beta↓ + Alpha↑) (OCD)",
            "note": "Core OCD",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [9.0, 12.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                    {"frequency_range": [4.0, 7.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M2: SMR Inhibitory Control (Stability / Sleep / Compulsions) (OCD)",
            "note": "Good starter/stabilizer; blends well with M1.",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [12.0, 15.0], "channels": ["C4"], "type": "reward"},
                    {"frequency_range": [2.0, 7.0], "channels": ["C4"], "type": "inhibit"},
                    {"frequency_range": [20.0, 30.0], "channels": ["C4"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M3: Fronto-Executive Control (Mid-Beta↑ with High-Beta↓) (OCD)",
            "note": "Reduce hyperarousal, pain amplification, stress reactivity",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [15.0, 18.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                    {"frequency_range": [4.0, 7.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M4: Alpha-Theta Relaxation (OCD)",
            "note": "",
            "features": {
                "frequency_bands": [
                    {
                        "type": "ratio", "name": "theta_alpha_ratio",
                        "numerator": "theta", "denominator": "alpha",
                        "numerator_range": [4.0, 7.0], "denominator_range": [8.0, 12.0],
                        "mode": "enhance", "channels": ["Pz"],
                    },
                    {"frequency_range": [22.0, 30.0], "channels": ["Pz"], "type": "inhibit"},
                ]
            }
        },
        # PTSD Protocols
        {
            "name": "M1: Hyperarousal Calming (PTSD)",
            "note": "Core PTSD; Reduce vigilance, downshift frontal overdrive",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [8.0, 12.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M2: SMR Sleep Stabilization (PTSD)",
            "note": "Improve sleep spindles, reduce nightmares, stabilize baseline",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [12.0, 15.0], "channels": ["C4"], "type": "reward"},
                    {"frequency_range": [2.0, 7.0], "channels": ["C4"], "type": "inhibit"},
                    {"frequency_range": [22.0, 30.0], "channels": ["C4"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M3: Fronto-Trauma Intrusion Modulation (Frontal Theta↓) (PTSD)",
            "note": "Reduce flashbacks, improve cognitive inhibition of intrusive memory",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [15.0, 18.0], "channels": ["Fz"], "type": "reward"},
                    {"frequency_range": [4.0, 7.0], "channels": ["Fz"], "type": "inhibit"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Fz"], "type": "inhibit"},
                ]
            }
        },
        {
            "name": "M4: Posterior Alpha Enhancement (Relaxation/Calm) (PTSD)",
            "note": "Strengthen sensory disengagement, support calm states.",
            "features": {
                "frequency_bands": [
                    {"frequency_range": [8.0, 12.0], "channels": ["Pz"], "type": "reward"},
                    {"frequency_range": [22.0, 30.0], "channels": ["Pz"], "type": "inhibit"},
                ]
            }
        },
    ]


# Track which user IDs have already been synced this process lifetime to avoid
# repeating the full upsert on every GET /protocols/ request.
_synced_users: set = set()


def _auto_create_hardcoded_protocols(db: Session, user_id: int) -> List[models.ProtocolLibrary]:
    """Called on every GET /protocols/ — syncs canonical defaults once per user per process start."""
    if user_id in _synced_users:
        return []

    canonical = _load_canonical_protocols()
    canonical_names = {p["name"] for p in canonical}
    created_protocols = []

    # Remove any default protocol no longer in the canonical set
    for existing in db.query(models.ProtocolLibrary).filter(
        and_(
            models.ProtocolLibrary.user_id == user_id,
            models.ProtocolLibrary.is_default == True,
        )
    ).all():
        if existing.name not in canonical_names:
            db.delete(existing)

    # Upsert all canonical protocols
    for protocol_data in canonical:
        existing = db.query(models.ProtocolLibrary).filter(
            and_(
                models.ProtocolLibrary.name == protocol_data["name"],
                models.ProtocolLibrary.user_id == user_id,
                models.ProtocolLibrary.is_default == True,
            )
        ).first()

        if existing:
            existing.features = protocol_data["features"]
            existing.note = protocol_data["note"]
        else:
            db_protocol = models.ProtocolLibrary(
                name=protocol_data["name"],
                note=protocol_data["note"],
                features=protocol_data["features"],
                user_id=user_id,
                is_default=True,
            )
            db.add(db_protocol)
            created_protocols.append(db_protocol)

    db.commit()
    for protocol in created_protocols:
        db.refresh(protocol)

    _synced_users.add(user_id)
    return created_protocols


def create_default_protocols(db: Session, user_id: int) -> List[models.ProtocolLibrary]:
    """(Re-)initialize default protocols for a user from the canonical JSON definitions."""
    canonical = _load_canonical_protocols()
    canonical_names = {p["name"] for p in canonical}
    created_protocols = []

    # Remove any default protocol no longer in the canonical set
    for existing in db.query(models.ProtocolLibrary).filter(
        and_(
            models.ProtocolLibrary.user_id == user_id,
            models.ProtocolLibrary.is_default == True,
        )
    ).all():
        if existing.name not in canonical_names:
            db.delete(existing)

    for protocol_data in canonical:
        existing = db.query(models.ProtocolLibrary).filter(
            and_(
                models.ProtocolLibrary.name == protocol_data["name"],
                models.ProtocolLibrary.user_id == user_id,
                models.ProtocolLibrary.is_default == True,
            )
        ).first()

        if existing:
            existing.features = protocol_data["features"]
            existing.note = protocol_data["note"]
            created_protocols.append(existing)
        else:
            db_protocol = models.ProtocolLibrary(
                name=protocol_data["name"],
                note=protocol_data["note"],
                features=protocol_data["features"],
                user_id=user_id,
                is_default=True,
            )
            db.add(db_protocol)
            created_protocols.append(db_protocol)

    db.commit()
    for protocol in created_protocols:
        db.refresh(protocol)

    _synced_users.discard(user_id)  # force re-sync next GET request
    return created_protocols
