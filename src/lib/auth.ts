import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: "consent",
                access_type: "offline",
                response_type: "code",
              },
            },
          }),
        ]
      : []),
    // Development fallback credentials provider for testing localhost before Google Cloud credentials are added
    CredentialsProvider({
      id: "credentials",
      name: "Demo / Dev User",
      credentials: {
        email: { label: "Email", type: "text", placeholder: "creator@example.com" },
        name: { label: "Name", type: "text", placeholder: "Content Creator" },
      },
      async authorize(credentials) {
        const email = credentials?.email || "creator@example.com";
        const name = credentials?.name || "Local Creator";

        let user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              name,
              image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
            },
          });

          // Create default automation settings
          await prisma.automationSetting.create({
            data: {
              userId: user.id,
              gapMinutes: 15,
              dailyLimit: 6,
              isRunning: false,
            },
          });
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      // Sync or create user in DB
      let dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            email: user.email,
            name: user.name,
            image: user.image,
          },
        });

        await prisma.automationSetting.create({
          data: {
            userId: dbUser.id,
            gapMinutes: 15,
            dailyLimit: 6,
            isRunning: false,
          },
        });
      }

      user.id = dbUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  secret: process.env.NEXTAUTH_SECRET || "default_secret_for_local_development_minimum_32_chars",
};
