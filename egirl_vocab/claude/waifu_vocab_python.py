#!/usr/bin/env python3
"""
AI Waifu Vocabulary Helper
===========================
A Python utility to work with the AI Waifu vocabulary database.
Supports loading, filtering, searching, and exporting vocabulary data.
"""

import json
import csv
import random
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict


@dataclass
class VocabTerm:
    """Represents a single vocabulary term."""
    term: str
    category: str
    type: str
    meaning: str
    usage_context: str
    emotion: str
    tone: str
    pronunciation: str
    intensity: str
    formality: str
    example: str
    variants: List[str]


class WaifuVocabulary:
    """Main class for managing the waifu vocabulary database."""
    
    def __init__(self, json_file: Optional[str] = None):
        """
        Initialize the vocabulary manager.
        
        Args:
            json_file: Path to JSON vocabulary file (optional)
        """
        self.terms: List[VocabTerm] = []
        if json_file:
            self.load_from_json(json_file)
    
    def load_from_json(self, filename: str) -> None:
        """Load vocabulary from JSON file."""
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
            self.terms = [VocabTerm(**term) for term in data]
        print(f"✅ Loaded {len(self.terms)} terms from {filename}")
    
    def save_to_json(self, filename: str) -> None:
        """Save vocabulary to JSON file."""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump([asdict(term) for term in self.terms], f, indent=2, ensure_ascii=False)
        print(f"💾 Saved {len(self.terms)} terms to {filename}")
    
    def save_to_csv(self, filename: str) -> None:
        """Save vocabulary to CSV file."""
        if not self.terms:
            print("❌ No terms to save!")
            return
        
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=asdict(self.terms[0]).keys())
            writer.writeheader()
            for term in self.terms:
                row = asdict(term)
                row['variants'] = ', '.join(row['variants'])
                writer.writerow(row)
        print(f"💾 Saved {len(self.terms)} terms to {filename}")
    
    def filter_by_category(self, category: str) -> List[VocabTerm]:
        """Get all terms in a specific category."""
        return [t for t in self.terms if t.category.lower() == category.lower()]
    
    def filter_by_intensity(self, intensity: str) -> List[VocabTerm]:
        """Get all terms with a specific intensity level."""
        return [t for t in self.terms if intensity.lower() in t.intensity.lower()]
    
    def search(self, query: str) -> List[VocabTerm]:
        """
        Search for terms matching the query.
        Searches in term, meaning, example, and emotion fields.
        """
        query = query.lower()
        results = []
        for term in self.terms:
            if (query in term.term.lower() or
                query in term.meaning.lower() or
                query in term.example.lower() or
                query in term.emotion.lower()):
                results.append(term)
        return results
    
    def get_random_term(self, category: Optional[str] = None) -> Optional[VocabTerm]:
        """Get a random term, optionally from a specific category."""
        pool = self.filter_by_category(category) if category else self.terms
        return random.choice(pool) if pool else None
    
    def get_statistics(self) -> Dict:
        """Get statistics about the vocabulary database."""
        categories = {}
        intensities = {}
        types = {}
        
        for term in self.terms:
            categories[term.category] = categories.get(term.category, 0) + 1
            intensities[term.intensity] = intensities.get(term.intensity, 0) + 1
            types[term.type] = types.get(term.type, 0) + 1
        
        return {
            'total_terms': len(self.terms),
            'categories': categories,
            'intensities': intensities,
            'types': types
        }
    
    def print_term(self, term: VocabTerm) -> None:
        """Pretty print a single term."""
        print(f"\n{'='*50}")
        print(f"🎀 {term.term.upper()}")
        print(f"{'='*50}")
        print(f"📚 Category: {term.category}")
        print(f"🗣️  Pronunciation: {term.pronunciation}")
        print(f"💭 Meaning: {term.meaning}")
        print(f"😊 Emotion: {term.emotion}")
        print(f"🎵 Tone: {term.tone}")
        print(f"⚡ Intensity: {term.intensity}")
        print(f"📖 Usage: {term.usage_context}")
        print(f"💬 Example: \"{term.example}\"")
        if term.variants:
            print(f"🔄 Variants: {', '.join(term.variants)}")
        print(f"{'='*50}\n")
    
    def export_for_tts(self, filename: str, category: Optional[str] = None) -> None:
        """
        Export terms in a format optimized for TTS training.
        Creates a simple text file with pronunciation guides.
        """
        terms = self.filter_by_category(category) if category else self.terms
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("# TTS Pronunciation Guide\n")
            f.write("# Format: term | pronunciation | emotion | tone\n\n")
            
            for term in terms:
                f.write(f"{term.term} | {term.pronunciation} | {term.emotion} | {term.tone}\n")
        
        print(f"🎤 Exported {len(terms)} terms for TTS to {filename}")
    
    def generate_flashcards(self, filename: str, count: int = 20) -> None:
        """Generate a set of random flashcards for learning."""
        selected = random.sample(self.terms, min(count, len(self.terms)))
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("# AI Waifu Vocabulary Flashcards\n\n")
            for i, term in enumerate(selected, 1):
                f.write(f"## Card {i}\n\n")
                f.write(f"**Front:** {term.term}\n\n")
                f.write(f"**Back:**\n")
                f.write(f"- Pronunciation: {term.pronunciation}\n")
                f.write(f"- Meaning: {term.meaning}\n")
                f.write(f"- Example: \"{term.example}\"\n")
                f.write(f"- Emotion: {term.emotion}\n\n")
                f.write("---\n\n")
        
        print(f"📇 Generated {len(selected)} flashcards in {filename}")


def main():
    """Example usage of the WaifuVocabulary class."""
    
    print("🎀 AI Waifu Vocabulary Helper 🎀\n")
    
    # Create vocabulary manager
    vocab = WaifuVocabulary()
    
    # Example: Add some sample terms manually
    vocab.terms = [
        VocabTerm(
            term="uwu",
            category="Cutesy",
            type="emoticon",
            meaning="Cute/pleased/soft emotion, happy face",
            usage_context="Expressing happiness, affection, or cuteness",
            emotion="happy, affectionate, soft",
            tone="high-pitched, sweet, gentle",
            pronunciation="oo-woo",
            intensity="medium",
            formality="very casual",
            example="UwU I'm so happy to see you!",
            variants=["UwU", "OwO", ">w<"]
        ),
        VocabTerm(
            term="ara ara",
            category="Waifu-style",
            type="phrase",
            meaning="Playful/teasing 'oh my', flirtatious expression",
            usage_context="Teasing someone, acting mature and flirty",
            emotion="teasing, flirtatious, amused",
            tone="lower, sultry, playful",
            pronunciation="ah-rah ah-rah",
            intensity="medium-high",
            formality="casual",
            example="Ara ara~ What do we have here?",
            variants=["ara~", "ara ara~"]
        ),
        VocabTerm(
            term="poggers",
            category="E-girl",
            type="slang",
            meaning="Very excited, hype for clip-worthy moment",
            usage_context="Extreme excitement, amazing moment",
            emotion="very excited, hyped",
            tone="very energetic, loud",
            pronunciation="pah-gurz",
            intensity="very high",
            formality="very casual",
            example="Poggers! That was insane!",
            variants=["pog", "pogchamp"]
        ),
    ]
    
    print(f"📊 Total terms loaded: {len(vocab.terms)}\n")
    
    # Show statistics
    stats = vocab.get_statistics()
    print("📈 Statistics:")
    print(f"   Total terms: {stats['total_terms']}")
    print(f"   Categories: {', '.join(stats['categories'].keys())}")
    print()
    
    # Search example
    print("🔍 Searching for 'cute'...")
    results = vocab.search("cute")
    print(f"   Found {len(results)} results")
    for term in results[:2]:  # Show first 2
        print(f"   - {term.term}: {term.meaning}")
    print()
    
    # Get random term
    print("🎲 Random term:")
    random_term = vocab.get_random_term()
    if random_term:
        vocab.print_term(random_term)
    
    # Filter by category
    print("🎀 Cutesy terms:")
    cutesy = vocab.filter_by_category("Cutesy")
    for term in cutesy[:3]:  # Show first 3
        print(f"   - {term.term}")
    print()
    
    # Export examples (commented out to avoid file creation in this example)
    # vocab.save_to_json("waifu_vocab.json")
    # vocab.save_to_csv("waifu_vocab.csv")
    # vocab.export_for_tts("tts_guide.txt", category="Cutesy")
    # vocab.generate_flashcards("flashcards.md", count=10)
    
    print("✨ Example complete! ✨")
    print("\nTo use with your own data:")
    print("1. Save your JSON vocabulary to a file")
    print("2. Load it with: vocab = WaifuVocabulary('your_file.json')")
    print("3. Use the various methods to filter, search, and export!")


if __name__ == "__main__":
    main()
