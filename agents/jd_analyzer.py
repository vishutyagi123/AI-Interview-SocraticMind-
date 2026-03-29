"""
agents/jd_analyzer.py  —  AGENT 1: JD Analyzer
================================================
Analyzes a job description (or raw domain name) and returns structured
interview data: role, difficulty, topics, weights, subtopics.

Uses MODEL_ANALYST (heavy model) for accurate extraction.
Robust fallback map ensures the interview always starts even if the LLM fails.
"""

import json
from utils.llm import call_llm
from config import MODEL_ANALYST

SYSTEM_PROMPT = """You are an expert technical recruiter and JD analyzer.

Given a job description text OR a domain name, extract structured data for a deep technical interview.

If given a domain name (like DSA, OS, DBMS, CN, ML, Python, Java, etc.), generate a realistic pseudo-JD for that domain.

You MUST output ONLY valid JSON in this exact format:
{
  "role": "the job role title",
  "difficulty_level": "easy | medium | hard",
  "topics": ["topic1", "topic2", "topic3"],
  "weights": {
    "topic1": 5,
    "topic2": 3,
    "topic3": 2
  },
  "subtopics": {
    "topic1": ["sub-topic A", "sub-topic B"],
    "topic2": ["sub-topic C"],
    "topic3": ["sub-topic D"]
  }
}

Rules:
- Weights are 1-5 (5 = most critical for the role).
- topics should be high-level (e.g., "Concurrency", "Memory Management").
- subtopics should be specific concepts (e.g., "Deadlocks", "RAII").
- Total topics: 3-6.
- No explanations. JSON only."""


# ── Domain keyword → fallback topics map ──────────────────────────────────────
# Keys are substrings matched against lowercased (domain + jd_text).
# Add as many aliases as needed — the more specific, the better the match.
_FALLBACK_MAP = {
    # ── Data Structures & Algorithms ──────────────────────────────────────────
    "data struct": {
        "role": "DSA Engineer",
        "topics": ["Arrays & Sorting", "Trees & Graphs", "Dynamic Programming", "Time Complexity"],
        "subtopics": {
            "Arrays & Sorting": ["Two Pointers", "Sliding Window", "Merge Sort"],
            "Trees & Graphs": ["DFS/BFS", "BST", "Dijkstra"],
            "Dynamic Programming": ["Memoization", "Tabulation", "State Design"],
            "Time Complexity": ["Big-O Analysis", "Space Complexity", "Amortized Analysis"],
        },
    },
    "algorithm": {
        "role": "DSA Engineer",
        "topics": ["Arrays & Sorting", "Trees & Graphs", "Dynamic Programming", "Time Complexity"],
        "subtopics": {
            "Arrays & Sorting": ["Two Pointers", "Sliding Window", "Merge Sort"],
            "Trees & Graphs": ["DFS/BFS", "BST", "Dijkstra"],
            "Dynamic Programming": ["Memoization", "Tabulation", "State Design"],
            "Time Complexity": ["Big-O Analysis", "Space Complexity", "Amortized Analysis"],
        },
    },
    # ── Operating Systems ─────────────────────────────────────────────────────
    "operating": {
        "role": "Systems Engineer",
        "topics": ["Processes & Threads", "Memory Management", "Deadlocks", "Scheduling"],
        "subtopics": {
            "Processes & Threads": ["Context Switch", "IPC", "Thread Safety"],
            "Memory Management": ["Virtual Memory", "Paging", "Segmentation"],
            "Deadlocks": ["Coffman Conditions", "Banker's Algorithm", "Prevention"],
            "Scheduling": ["Round Robin", "Priority Scheduling", "FCFS"],
        },
    },
    " os ": {
        "role": "Systems Engineer",
        "topics": ["Processes & Threads", "Memory Management", "Deadlocks", "Scheduling"],
        "subtopics": {
            "Processes & Threads": ["Context Switch", "IPC", "Thread Safety"],
            "Memory Management": ["Virtual Memory", "Paging", "Segmentation"],
            "Deadlocks": ["Coffman Conditions", "Banker's Algorithm", "Prevention"],
            "Scheduling": ["Round Robin", "Priority Scheduling", "FCFS"],
        },
    },
    # ── Database ──────────────────────────────────────────────────────────────
    "database": {
        "role": "Database Engineer",
        "topics": ["SQL & Indexing", "Transactions & ACID", "Normalization", "Query Optimization"],
        "subtopics": {
            "SQL & Indexing": ["B-Tree Index", "Clustered vs Non-Clustered", "Composite Index"],
            "Transactions & ACID": ["Isolation Levels", "MVCC", "Two-Phase Locking"],
            "Normalization": ["1NF/2NF/3NF", "BCNF", "Denormalization Trade-offs"],
            "Query Optimization": ["Execution Plan", "Join Strategies", "Query Rewriting"],
        },
    },
    "dbms": {
        "role": "Database Engineer",
        "topics": ["SQL & Indexing", "Transactions & ACID", "Normalization", "Query Optimization"],
        "subtopics": {
            "SQL & Indexing": ["B-Tree Index", "Clustered vs Non-Clustered", "Composite Index"],
            "Transactions & ACID": ["Isolation Levels", "MVCC", "Two-Phase Locking"],
            "Normalization": ["1NF/2NF/3NF", "BCNF", "Denormalization Trade-offs"],
            "Query Optimization": ["Execution Plan", "Join Strategies", "Query Rewriting"],
        },
    },
    # ── Networking ────────────────────────────────────────────────────────────
    "network": {
        "role": "Network Engineer",
        "topics": ["TCP/IP Stack", "DNS & HTTP", "OSI Model", "Security Protocols"],
        "subtopics": {
            "TCP/IP Stack": ["Three-Way Handshake", "Flow Control", "Congestion Control"],
            "DNS & HTTP": ["DNS Resolution", "HTTP/2", "TLS Handshake"],
            "OSI Model": ["Layer Responsibilities", "Encapsulation", "Protocol Mapping"],
            "Security Protocols": ["TLS/SSL", "OAuth", "JWT"],
        },
    },
    # ── System Design ─────────────────────────────────────────────────────────
    "system design": {
        "role": "System Design Engineer",
        "topics": ["Scalability", "Caching", "Microservices", "Load Balancing"],
        "subtopics": {
            "Scalability": ["Horizontal vs Vertical", "CAP Theorem", "Sharding"],
            "Caching": ["LRU/LFU", "Cache Invalidation", "Redis Patterns"],
            "Microservices": ["Service Discovery", "API Gateway", "Event-Driven"],
            "Load Balancing": ["Round Robin", "Consistent Hashing", "Health Checks"],
        },
    },
    # ── Machine Learning / AI ─────────────────────────────────────────────────
    "machine learn": {
        "role": "ML Engineer",
        "topics": ["Model Training", "Feature Engineering", "Evaluation Metrics", "Neural Networks"],
        "subtopics": {
            "Model Training": ["Gradient Descent", "Regularization", "Hyperparameter Tuning"],
            "Feature Engineering": ["Normalization", "Encoding", "Feature Selection"],
            "Evaluation Metrics": ["Precision/Recall", "ROC-AUC", "Cross-Validation"],
            "Neural Networks": ["Backpropagation", "Activation Functions", "Overfitting"],
        },
    },
    "deep learn": {
        "role": "Deep Learning Engineer",
        "topics": ["Neural Networks", "CNNs & RNNs", "Training Strategies", "Model Deployment"],
        "subtopics": {
            "Neural Networks": ["Backpropagation", "Activation Functions", "Batch Normalization"],
            "CNNs & RNNs": ["Convolution", "LSTM", "Attention Mechanism"],
            "Training Strategies": ["Transfer Learning", "Data Augmentation", "Early Stopping"],
            "Model Deployment": ["ONNX", "TensorRT", "Serving Infrastructure"],
        },
    },
    "artificial intel": {
        "role": "AI Engineer",
        "topics": ["Search Algorithms", "Knowledge Representation", "ML Fundamentals", "NLP Basics"],
        "subtopics": {
            "Search Algorithms": ["A*", "Heuristics", "Minimax"],
            "Knowledge Representation": ["Ontologies", "Bayesian Networks", "Semantic Web"],
            "ML Fundamentals": ["Supervised Learning", "Clustering", "Dimensionality Reduction"],
            "NLP Basics": ["Tokenization", "Embeddings", "Language Models"],
        },
    },
    # ── Python ────────────────────────────────────────────────────────────────
    "python": {
        "role": "Python Developer",
        "topics": ["OOP & Design Patterns", "Concurrency", "Data Structures", "Testing"],
        "subtopics": {
            "OOP & Design Patterns": ["SOLID Principles", "Decorators", "Metaclasses"],
            "Concurrency": ["asyncio", "Threading vs Multiprocessing", "GIL"],
            "Data Structures": ["List/Dict Internals", "Generator", "Collections"],
            "Testing": ["unittest/pytest", "Mocking", "TDD"],
        },
    },
    # ── Web Development ───────────────────────────────────────────────────────
    "web": {
        "role": "Web Developer",
        "topics": ["Frontend Concepts", "Backend APIs", "Databases", "Performance"],
        "subtopics": {
            "Frontend Concepts": ["DOM", "Event Loop", "React/Vue"],
            "Backend APIs": ["REST vs GraphQL", "Auth", "Middleware"],
            "Databases": ["ORM", "SQL vs NoSQL", "Migrations"],
            "Performance": ["Caching", "CDN", "Lazy Loading"],
        },
    },
    "react": {
        "role": "Frontend Engineer",
        "topics": ["React Core", "State Management", "Performance", "Testing"],
        "subtopics": {
            "React Core": ["Virtual DOM", "Hooks", "Component Lifecycle"],
            "State Management": ["Redux", "Context API", "Zustand"],
            "Performance": ["Memoization", "Code Splitting", "Lazy Loading"],
            "Testing": ["Jest", "React Testing Library", "E2E"],
        },
    },
    # ── Cloud / DevOps ────────────────────────────────────────────────────────
    "cloud": {
        "role": "Cloud Engineer",
        "topics": ["Cloud Architecture", "Containers & K8s", "CI/CD", "Monitoring"],
        "subtopics": {
            "Cloud Architecture": ["VPC", "IAM", "Serverless"],
            "Containers & K8s": ["Docker", "Kubernetes", "Helm"],
            "CI/CD": ["GitOps", "Pipelines", "Blue-Green Deployment"],
            "Monitoring": ["Prometheus", "Grafana", "Alerting"],
        },
    },
    "devops": {
        "role": "DevOps Engineer",
        "topics": ["CI/CD Pipelines", "Infrastructure as Code", "Containers", "Monitoring"],
        "subtopics": {
            "CI/CD Pipelines": ["Jenkins", "GitHub Actions", "Artifact Management"],
            "Infrastructure as Code": ["Terraform", "Ansible", "CloudFormation"],
            "Containers": ["Docker", "Kubernetes", "Service Mesh"],
            "Monitoring": ["Observability", "Log Aggregation", "Tracing"],
        },
    },
    "kubernetes": {
        "role": "Platform Engineer",
        "topics": ["Kubernetes Architecture", "Workloads", "Networking", "Storage"],
        "subtopics": {
            "Kubernetes Architecture": ["Control Plane", "Scheduler", "etcd"],
            "Workloads": ["Deployments", "StatefulSets", "DaemonSets"],
            "Networking": ["Services", "Ingress", "Network Policies"],
            "Storage": ["PV/PVC", "StorageClass", "CSI"],
        },
    },
    # ── Cybersecurity ─────────────────────────────────────────────────────────
    "security": {
        "role": "Security Engineer",
        "topics": ["Cryptography", "Web Security", "Network Security", "Incident Response"],
        "subtopics": {
            "Cryptography": ["Symmetric vs Asymmetric", "Hashing", "PKI"],
            "Web Security": ["OWASP Top 10", "XSS/CSRF", "SQL Injection"],
            "Network Security": ["Firewalls", "IDS/IPS", "VPN"],
            "Incident Response": ["Forensics", "Threat Modeling", "SIEM"],
        },
    },
    "cyber": {
        "role": "Cybersecurity Engineer",
        "topics": ["Cryptography", "Web Security", "Network Security", "Incident Response"],
        "subtopics": {
            "Cryptography": ["Symmetric vs Asymmetric", "Hashing", "PKI"],
            "Web Security": ["OWASP Top 10", "XSS/CSRF", "SQL Injection"],
            "Network Security": ["Firewalls", "IDS/IPS", "VPN"],
            "Incident Response": ["Forensics", "Threat Modeling", "SIEM"],
        },
    },
    # ── Embedded / Hardware ───────────────────────────────────────────────────
    "embedded": {
        "role": "Embedded Systems Engineer",
        "topics": ["Microcontrollers", "Real-Time OS", "Communication Protocols", "Memory Management"],
        "subtopics": {
            "Microcontrollers": ["GPIO", "Interrupts", "ADC/DAC"],
            "Real-Time OS": ["FreeRTOS", "Scheduling", "Task Management"],
            "Communication Protocols": ["I2C", "SPI", "UART", "CAN"],
            "Memory Management": ["Stack vs Heap", "DMA", "Memory-Mapped I/O"],
        },
    },
    "firmware": {
        "role": "Firmware Engineer",
        "topics": ["Microcontrollers", "Real-Time OS", "Communication Protocols", "Low-Level Debugging"],
        "subtopics": {
            "Microcontrollers": ["Boot Sequence", "Interrupts", "Peripherals"],
            "Real-Time OS": ["FreeRTOS", "Task Synchronization", "Watchdog"],
            "Communication Protocols": ["I2C", "SPI", "UART"],
            "Low-Level Debugging": ["JTAG", "GDB", "Logic Analyzer"],
        },
    },
    # ── Biomedical / BCI ──────────────────────────────────────────────────────
    "brain": {
        "role": "BCI / Neurotechnology Engineer",
        "topics": ["Neural Signal Processing", "Machine Learning for BCI", "Hardware Interfaces", "Real-Time Systems"],
        "subtopics": {
            "Neural Signal Processing": ["EEG/ECoG", "Spike Sorting", "Filtering & Denoising"],
            "Machine Learning for BCI": ["Feature Extraction", "Classification", "Transfer Learning"],
            "Hardware Interfaces": ["Electrode Arrays", "Amplifiers", "DAQ Systems"],
            "Real-Time Systems": ["Latency Constraints", "FPGA", "Embedded Linux"],
        },
    },
    "bci": {
        "role": "BCI / Neurotechnology Engineer",
        "topics": ["Neural Signal Processing", "Machine Learning for BCI", "Hardware Interfaces", "Real-Time Systems"],
        "subtopics": {
            "Neural Signal Processing": ["EEG/ECoG", "Spike Sorting", "Filtering & Denoising"],
            "Machine Learning for BCI": ["Feature Extraction", "Classification", "Transfer Learning"],
            "Hardware Interfaces": ["Electrode Arrays", "Amplifiers", "DAQ Systems"],
            "Real-Time Systems": ["Latency Constraints", "FPGA", "Embedded Linux"],
        },
    },
    "neuro": {
        "role": "Neurotechnology Engineer",
        "topics": ["Neural Signal Processing", "Machine Learning for BCI", "Hardware Interfaces", "Real-Time Systems"],
        "subtopics": {
            "Neural Signal Processing": ["EEG/ECoG", "Spike Sorting", "Filtering & Denoising"],
            "Machine Learning for BCI": ["Feature Extraction", "Classification", "Transfer Learning"],
            "Hardware Interfaces": ["Electrode Arrays", "Amplifiers", "DAQ Systems"],
            "Real-Time Systems": ["Latency Constraints", "FPGA", "Embedded Linux"],
        },
    },
    "biomedical": {
        "role": "Biomedical Engineer",
        "topics": ["Signal Processing", "Medical Imaging", "Embedded Systems", "Regulatory Compliance"],
        "subtopics": {
            "Signal Processing": ["ECG/EEG Analysis", "FFT", "Noise Reduction"],
            "Medical Imaging": ["DICOM", "Image Segmentation", "CT/MRI Processing"],
            "Embedded Systems": ["Medical Device Firmware", "Real-Time OS", "Safety Standards"],
            "Regulatory Compliance": ["FDA 510(k)", "IEC 62304", "ISO 13485"],
        },
    },
    # ── Data Engineering ──────────────────────────────────────────────────────
    "data engineer": {
        "role": "Data Engineer",
        "topics": ["Data Pipelines", "Distributed Processing", "Data Warehousing", "Stream Processing"],
        "subtopics": {
            "Data Pipelines": ["ETL/ELT", "Airflow", "dbt"],
            "Distributed Processing": ["Spark", "Hadoop", "MapReduce"],
            "Data Warehousing": ["Snowflake", "BigQuery", "Star Schema"],
            "Stream Processing": ["Kafka", "Flink", "Kinesis"],
        },
    },
    "spark": {
        "role": "Data Engineer",
        "topics": ["Apache Spark", "Distributed Systems", "Data Pipelines", "Performance Tuning"],
        "subtopics": {
            "Apache Spark": ["RDD vs DataFrame", "Transformations & Actions", "Catalyst Optimizer"],
            "Distributed Systems": ["Partitioning", "Fault Tolerance", "Shuffle"],
            "Data Pipelines": ["ETL", "Streaming", "Batch Processing"],
            "Performance Tuning": ["Caching", "Broadcast Join", "Partition Pruning"],
        },
    },
    # ── Blockchain ────────────────────────────────────────────────────────────
    "blockchain": {
        "role": "Blockchain Developer",
        "topics": ["Consensus Mechanisms", "Smart Contracts", "Cryptography", "Distributed Ledger"],
        "subtopics": {
            "Consensus Mechanisms": ["PoW vs PoS", "BFT", "Finality"],
            "Smart Contracts": ["Solidity", "EVM", "Gas Optimization"],
            "Cryptography": ["Hash Functions", "Digital Signatures", "Merkle Trees"],
            "Distributed Ledger": ["P2P Networks", "State Management", "Forks"],
        },
    },
    # ── Robotics ──────────────────────────────────────────────────────────────
    "robot": {
        "role": "Robotics Engineer",
        "topics": ["Control Systems", "Path Planning", "Sensors & Actuators", "ROS"],
        "subtopics": {
            "Control Systems": ["PID Controller", "State Machines", "Kalman Filter"],
            "Path Planning": ["A*", "RRT", "SLAM"],
            "Sensors & Actuators": ["IMU", "LiDAR", "Motor Control"],
            "ROS": ["Topics & Services", "TF Transforms", "Navigation Stack"],
        },
    },
    # ── Computer Vision ───────────────────────────────────────────────────────
    "computer vision": {
        "role": "Computer Vision Engineer",
        "topics": ["Image Processing", "Deep Learning for Vision", "Object Detection", "3D Vision"],
        "subtopics": {
            "Image Processing": ["Convolution", "Edge Detection", "Morphological Ops"],
            "Deep Learning for Vision": ["CNN Architectures", "Transfer Learning", "Data Augmentation"],
            "Object Detection": ["YOLO", "Faster R-CNN", "Anchor Boxes"],
            "3D Vision": ["Stereo Vision", "Point Clouds", "Depth Estimation"],
        },
    },
    # ── NLP ───────────────────────────────────────────────────────────────────
    "natural language": {
        "role": "NLP Engineer",
        "topics": ["Text Processing", "Language Models", "Sequence Modeling", "Information Retrieval"],
        "subtopics": {
            "Text Processing": ["Tokenization", "Stemming", "TF-IDF"],
            "Language Models": ["Transformers", "BERT/GPT", "Fine-Tuning"],
            "Sequence Modeling": ["RNN/LSTM", "Attention", "Seq2Seq"],
            "Information Retrieval": ["Embeddings", "RAG", "Vector Search"],
        },
    },
    "nlp": {
        "role": "NLP Engineer",
        "topics": ["Text Processing", "Language Models", "Sequence Modeling", "Information Retrieval"],
        "subtopics": {
            "Text Processing": ["Tokenization", "Stemming", "TF-IDF"],
            "Language Models": ["Transformers", "BERT/GPT", "Fine-Tuning"],
            "Sequence Modeling": ["RNN/LSTM", "Attention", "Seq2Seq"],
            "Information Retrieval": ["Embeddings", "RAG", "Vector Search"],
        },
    },
    # ── Game Dev ──────────────────────────────────────────────────────────────
    "game": {
        "role": "Game Developer",
        "topics": ["Game Engine Architecture", "Physics Simulation", "Rendering", "AI & Pathfinding"],
        "subtopics": {
            "Game Engine Architecture": ["ECS", "Scene Graph", "Asset Pipeline"],
            "Physics Simulation": ["Collision Detection", "Rigid Bodies", "Raycasting"],
            "Rendering": ["Rasterization", "Shaders", "PBR"],
            "AI & Pathfinding": ["A*", "Behavior Trees", "FSMs"],
        },
    },
    # ── Java ──────────────────────────────────────────────────────────────────
    "java": {
        "role": "Java Developer",
        "topics": ["OOP & Design Patterns", "JVM Internals", "Concurrency", "Spring Framework"],
        "subtopics": {
            "OOP & Design Patterns": ["SOLID", "Factory/Singleton", "Strategy"],
            "JVM Internals": ["GC Algorithms", "Class Loading", "JIT Compilation"],
            "Concurrency": ["Threads", "ExecutorService", "CompletableFuture"],
            "Spring Framework": ["IoC/DI", "Spring Boot", "Spring Security"],
        },
    },
}


def _get_fallback(domain: str, jd_text: str) -> dict:
    """
    Return fallback data based on domain/JD keywords.

    Matching strategy (in order):
      1. Exact substring match against _FALLBACK_MAP keys
      2. If no match but domain provided → domain-adaptive generic fallback
         (uses the domain name as role title and infers generic topics)
      3. Truly empty input → software engineering defaults
    """
    combined = (domain + " " + jd_text[:500]).lower()

    # 1. Try keyword match
    for keyword, data in _FALLBACK_MAP.items():
        if keyword in combined:
            topics = data["topics"]
            return {
                "role": data["role"],
                "difficulty_level": "medium",
                "topics": topics,
                "weights": {t: max(1, 5 - i) for i, t in enumerate(topics)},
                "subtopics": data["subtopics"],
            }

    # 2. Unknown domain — build a sensible fallback from the domain name itself.
    # The interview will still start; Agent 2 uses the domain name for question gen.
    if domain and domain.strip():
        role = domain.strip().title() + " Engineer"
        topics = [
            f"{domain.strip().title()} Fundamentals",
            "Problem Solving & Algorithms",
            "System Design",
            "Best Practices & Testing",
        ]
        return {
            "role": role,
            "difficulty_level": "medium",
            "topics": topics,
            "weights": {t: max(1, 5 - i) for i, t in enumerate(topics)},
            "subtopics": {
                topics[0]: ["Core Concepts", "Key Algorithms", "Industry Applications"],
                topics[1]: ["Algorithm Design", "Time Complexity", "Edge Cases"],
                topics[2]: ["Architecture", "Scalability", "Trade-offs"],
                topics[3]: ["Code Quality", "Testing", "Documentation"],
            },
        }

    # 3. Truly empty — generic software engineering
    return {
        "role": "Software Engineer",
        "difficulty_level": "medium",
        "topics": ["Problem Solving", "Data Structures", "System Design", "Best Practices"],
        "weights": {"Problem Solving": 5, "Data Structures": 4, "System Design": 3, "Best Practices": 2},
        "subtopics": {
            "Problem Solving": ["Algorithm Design", "Time Complexity"],
            "Data Structures": ["Arrays", "Hash Maps"],
            "System Design": ["Scalability", "APIs"],
            "Best Practices": ["Code Quality", "Testing"],
        },
    }


async def analyze_jd(domain: str = "", jd_text: str = "") -> dict:
    """
    Analyze JD text or domain name → structured interview config.

    Priority:
      1. JD text (if ≥ 40 chars) → send to LLM
      2. Domain name (any non-empty string) → send to LLM as pseudo-JD prompt
      3. LLM fails or returns bad JSON → _get_fallback() always saves us
         (unknown domains like BCI, Robotics, etc. all work via fallback)

    The interview ALWAYS starts — no domain is too niche or unknown.
    """
    if jd_text and len(jd_text.strip()) >= 40:
        inp = jd_text[:3500]
    elif domain and domain.strip():
        # Send ANY domain — the LLM is smart enough to handle BCI, Robotics, etc.
        inp = (
            f"Domain: {domain.strip()}. "
            f"Generate a realistic deep technical interview structure for a {domain.strip()} engineer role. "
            f"Include domain-specific topics with subtopics. JSON only."
        )
    else:
        inp = "Software Engineering — general full-stack role."

    result = await call_llm(SYSTEM_PROMPT, inp, model=MODEL_ANALYST, max_tokens=700, temperature=0.5)

    # Validate required keys — LLM output must have topics to be usable
    if not isinstance(result, dict) or not result.get("topics"):
        # LLM failed → use fallback (handles unknown domains gracefully)
        result = _get_fallback(domain, jd_text)
    else:
        # LLM succeeded → fill any missing keys from fallback
        fallback = _get_fallback(domain, jd_text)
        for key, val in fallback.items():
            if key not in result or not result[key]:
                result[key] = val

    return result