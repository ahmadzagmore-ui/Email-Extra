import { GoogleGenAI } from "@google/genai";
import type { Email } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const BUSINESSES_TO_DISCOVER = 25;

interface Business {
    name: string;
    website?: string;
}

interface FoundEmail {
    email: string;
    source: string;
}

/**
 * Parses a JSON object from a string, expecting it to be in a markdown block.
 * @param text The text response from the model.
 * @returns A parsed JSON object, or null if parsing fails.
 */
const parseJsonFromMarkdown = (text: string): any => {
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (match && match[1]) {
        try {
            return JSON.parse(match[1]);
        } catch (e) {
            console.error("Failed to parse JSON from markdown", e);
            return null;
        }
    }
    // Fallback for cases where the model doesn't use a markdown block
    try {
        return JSON.parse(text);
    } catch(e) {
        return null;
    }
};


export const findBusinessEmailsStream = async (
    city: string, 
    service: string, 
    existingEmails: Set<string>,
    abortSignal: AbortSignal,
    updatePhase: (phase: string) => void,
    onNewEmailFound: (email: Omit<Email, 'id'>) => void,
    onGroundingChunksFound: (chunks: any[]) => void
): Promise<{ finalError?: string, wasCancelled?: boolean }> => {
    
    // Phase 1: Discover Businesses using Google Search
    updatePhase(`الخطوة 1: تحديد الأنشطة التجارية المستهدفة في '${city}' باستخدام بحث Google...`);
    
    const discoveryPrompt = `
      Based on a comprehensive Google Search, identify up to ${BUSINESSES_TO_DISCOVER} business names for '${service}' in '${city}'.
      Your goal is to find businesses with currently active and working websites.
      Focus on variety and try to find different businesses than a previous search might have. Avoid simply listing the top search results; explore different pages and sources.
      Provide their names and their verified, functional website URLs.
      Do NOT look for emails yet.
      
      CRITICAL: Respond with ONLY a JSON object in a markdown block like this:
      \`\`\`json
      {
        "businesses": [
          { "name": "Business Name 1", "website": "http://example.com" },
          { "name": "Business Name 2", "website": "http://example2.com" }
        ]
      }
      \`\`\`
      `;

    let businessesToScrape: Business[] = [];

    try {
        if (abortSignal.aborted) return { wasCancelled: true };

        const discoveryResult = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: discoveryPrompt,
            config: {
                tools: [{googleSearch: {}}],
                seed: Math.floor(Math.random() * 1000000)
            }
        });
        
        const chunks = discoveryResult.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
            onGroundingChunksFound(chunks);
        }

        const responseJson = parseJsonFromMarkdown(discoveryResult.text);

        if (!responseJson || !responseJson.businesses || responseJson.businesses.length === 0) {
            return { finalError: "لم أتمكن من تحديد أي أنشطة تجارية. جرب البحث بكلمات مفتاحية مختلفة أو أكثر تحديدًا." };
        }
        businessesToScrape = responseJson.businesses;

    } catch(err) {
        if (abortSignal.aborted) return { wasCancelled: true };
        console.error("Gemini business discovery error:", err);
        return { finalError: "حدث خطأ أثناء تحديد الأنشطة التجارية."};
    }

    if (abortSignal.aborted) return { wasCancelled: true };
    updatePhase(`الخطوة 2: تم تحديد ${businessesToScrape.length} نشاطًا تجاريًا. بدء مرحلة الغوص العميق...`);
    await new Promise(resolve => setTimeout(resolve, 1500));

    const existingEmailsString = Array.from(existingEmails).join(', ');
    
    // Phase 2: Deep Dive for Emails using Google Search
    for (let i = 0; i < businessesToScrape.length; i++) {
        if (abortSignal.aborted) {
            return { wasCancelled: true };
        }

        const business = businessesToScrape[i];
        updatePhase(`(${i + 1}/${businessesToScrape.length}) جاري فحص النشاط: ${business.name}...`);

        const deepDivePrompt = `
        Your task is to find the public contact email for the business named "${business.name}" in "${city}". Their website is likely: ${business.website || 'غير متوفر'}.

        Follow these steps precisely:
        1.  **Verify Website Status:** First, use your search tool to check if the website "${business.website}" is currently online and functional. If the website is broken, shows an error, or is inaccessible, you MUST stop immediately and return an empty array for "found_emails". Do not proceed further for this business.
        2.  **Search for Email:** If the website is working, use Google Search to examine it thoroughly for a contact email. Look at pages like 'Contact Us', 'About Us', or the site footer. Also, perform a separate search for "'${business.name}' '${city}' contact email".
        
        CRITICAL RULES:
        - Do NOT return any of these already found emails: ${existingEmailsString || 'لا يوجد'}.
        - Respond with ONLY a JSON object in a markdown block like this. If you find no new, valid emails, you MUST return an empty "found_emails" array.
        \`\`\`json
        {
          "found_emails": [
            { "email": "contact@example.com", "source": "http://example.com/contact" }
          ]
        }
        \`\`\`
        `;

        try {
            const deepDiveResult = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: deepDivePrompt,
                config: {
                    tools: [{googleSearch: {}}],
                    seed: Math.floor(Math.random() * 1000000)
                }
            });
            
            const chunks = deepDiveResult.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (chunks) {
                onGroundingChunksFound(chunks);
            }
            
            const responseJson = parseJsonFromMarkdown(deepDiveResult.text);

            if (responseJson && responseJson.found_emails && responseJson.found_emails.length > 0) {
                for (const emailData of responseJson.found_emails as FoundEmail[]) {
                    const emailLower = emailData.email.toLowerCase();
                    if (!existingEmails.has(emailLower)) {
                         const newEmail = {
                            email: emailData.email,
                            source: emailData.source,
                            business_name: business.name,
                            city,
                            service
                        };
                        onNewEmailFound(newEmail); // Stream the result back
                        existingEmails.add(emailLower); // Add to set to avoid duplicates in the same session
                    }
                }
            }
        } catch(err) {
            if (abortSignal.aborted) return { wasCancelled: true };
            console.error(`Error deep diving for ${business.name}:`, err);
            // Continue to the next business even if one fails
        }
    }
    
    return {}; // Success, no final error
};